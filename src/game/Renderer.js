/**
 * Canvas renderer. Handles letterboxed world scaling, neon post effects,
 * blackout visibility and glitch overlays.
 */
import { Arena } from './Arena.js';
import { Orb } from './Orb.js';

const WORLD_W = 1440;
const WORLD_H = 810;

export class Renderer {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ctx = game.ctx;
    this.view = { w: 1, h: 1, dpr: 1, scale: 1, offsetX: 0, offsetY: 0 };
    this.menuArena = new Arena(0x4af7e2);
    this.menuOrbs = [
      new Orb(410, 250, { phase: 0.4, born: 0 }),
      new Orb(1030, 260, { phase: 1.9, born: 0, big: true, value: 28 }),
      new Orb(720, 560, { phase: 3.1, born: 0 }),
      new Orb(310, 590, { phase: 4.4, born: 0 }),
      new Orb(1130, 560, { phase: 2.2, born: 0 }),
      new Orb(830, 380, { phase: 5.1, born: 0, big: true, value: 28 }),
    ];
    this.ghosts = [
      { phase: 0, color: '#22d3ee', speed: 0.26 },
      { phase: 2.1, color: '#a855f7', speed: 0.19 },
      { phase: 4.2, color: '#67e8f9', speed: 0.33 },
    ];
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    const scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.view = {
      w,
      h,
      dpr,
      scale,
      offsetX: (w - WORLD_W * scale) / 2,
      offsetY: (h - WORLD_H * scale) / 2,
    };
  }

  worldToScreen(x, y) {
    return {
      x: this.view.offsetX + x * this.view.scale,
      y: this.view.offsetY + y * this.view.scale,
    };
  }

  _begin() {
    const ctx = this.ctx;
    const { dpr, w, h } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#0a0918');
    bg.addColorStop(0.6, '#06060f');
    bg.addColorStop(1, '#030308');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  _shakeOffset() {
    const game = this.game;
    if (!game.screenShake || game.shakeTime <= 0) return { x: 0, y: 0 };
    const m = game.shakeMag * Math.min(1, game.shakeTime / 0.15);
    return {
      x: (Math.random() * 2 - 1) * m,
      y: (Math.random() * 2 - 1) * m,
    };
  }

  _worldTransform(extraShake = true) {
    const ctx = this.ctx;
    const { dpr, scale, offsetX, offsetY } = this.view;
    const shake = extraShake ? this._shakeOffset() : { x: 0, y: 0 };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offsetX + shake.x, offsetY + shake.y);
    ctx.scale(scale, scale);
  }

  render() {
    this._begin();
    if (this.game.state === 'menu') {
      this._drawMenu();
    } else {
      this._drawWorld();
      this._drawScreenEffects();
    }
  }

  _drawMenu() {
    const game = this.game;
    const ctx = this.ctx;
    const t = game.visualTime;
    this._worldTransform(false);

    this.menuArena.drawFloor(ctx, t, game.reducedMotion);
    this.menuArena.drawRelays(ctx, t);
    this.menuArena.drawObstacles(ctx, t);

    for (const orb of this.menuOrbs) orb.draw(ctx, t);

    this._drawMenuGhosts(ctx, t);

    ctx.save();
    ctx.globalAlpha = 0.7;
    game.particles.draw(ctx);
    ctx.restore();

    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
  }

  _drawMenuGhosts(ctx, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ghost of this.ghosts) {
      const points = [];
      for (let k = 0; k < 5; k++) {
        const tt = time - k * 0.055;
        const x = 720 + Math.cos(tt * ghost.speed + ghost.phase) * 430 + Math.sin(tt * 0.17 + ghost.phase) * 90;
        const y = 405 + Math.sin(tt * ghost.speed * 1.25 + ghost.phase) * 245 + Math.cos(tt * 0.21) * 40;
        points.push({ x, y });
      }
      for (let k = points.length - 1; k >= 0; k--) {
        const p = points[k];
        ctx.globalAlpha = 0.16 * (1 - k / points.length);
        ctx.fillStyle = ghost.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15 * (1 - k * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
      const head = points[0];
      const prev = points[1];
      const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = ghost.color;
      ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
      ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(9, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(-9, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawWorld() {
    const game = this.game;
    const ctx = this.ctx;
    const t = game.visualTime;

    this._worldTransform(true);

    game.arena.drawFloor(ctx, t, game.reducedMotion);
    game.arena.drawRelays(ctx, t);
    game.arena.drawObstacles(ctx, t);

    for (const powerup of game.powerups) {
      if (!powerup.collected) powerup.draw(ctx, t);
    }
    for (const orb of game.orbs) {
      if (!orb.collected) orb.draw(ctx, t);
    }
    for (const echo of game.echoes) {
      echo.draw(ctx, t, game.effectsQuality);
    }
    for (const enemy of game.enemies) {
      if (!enemy.dead) enemy.draw(ctx, t, game.effectsQuality);
    }
    for (const projectile of game.projectiles) {
      if (!projectile.dead) projectile.draw(ctx, t, game.effectsQuality);
    }

    if (game.player.alive) {
      game.player.draw(ctx, t, game);
    }

    game.particles.draw(ctx);

    // Pulse shockwaves
    for (const wave of game.shockwaves) {
      const a = Math.max(0, wave.life / wave.maxLife);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.5 + a * 4;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.35;
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
  }

  _drawScreenEffects() {
    const game = this.game;
    if (game.state === 'menu' || game.state === 'gameover') return;
    const ctx = this.ctx;
    const { w, h } = this.view;

    if (game.eventDirector?.blackoutActive) {
      const p = this.worldToScreen(game.player.x, game.player.y);
      const radius = Math.max(150, Math.min(w, h) * 0.34);
      const grad = ctx.createRadialGradient(p.x, p.y, radius * 0.24, p.x, p.y, radius);
      grad.addColorStop(0, 'rgba(3, 3, 8, 0)');
      grad.addColorStop(0.45, 'rgba(3, 3, 8, 0.55)');
      grad.addColorStop(0.78, 'rgba(3, 3, 8, 0.9)');
      grad.addColorStop(1, 'rgba(2, 2, 6, 0.98)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(game.visualTime * 4) * 0.1;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (game.eventDirector?.active?.id === 'glitch' && !game.reducedMotion) {
      ctx.save();
      const bars = 7;
      for (let i = 0; i < bars; i++) {
        if (Math.random() > 0.55) continue;
        const y = Math.random() * h;
        const height = 1 + Math.random() * 8;
        ctx.globalAlpha = 0.08 + Math.random() * 0.16;
        ctx.fillStyle = Math.random() > 0.5 ? '#22d3ee' : '#ff2d55';
        ctx.fillRect(0, y, w, height);
      }
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#a855f7';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(Math.random() * w, 0, 1, h);
      }
      ctx.restore();
    }
  }
}
