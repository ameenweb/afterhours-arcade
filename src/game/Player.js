/**
 * The player operative. Movement, dash, pulse charge, health and rendering.
 * All timing is delta-time based so behavior is consistent at any frame rate.
 */
import { normalize } from './Collision.js';

const DASH_DURATION = 0.17;
const DASH_SPEED = 980;
const BASE_DASH_COOLDOWN = 2.35;
const BASE_SPEED = 330;

export class Player {
  constructor(x, y, skin) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.skin = skin;
    this.baseSpeed = BASE_SPEED;
    this.reset(x, y, 100);
  }

  reset(x, y, health = 100) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = health;
    this.maxHealth = health;
    this.shieldHits = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashCdMax = BASE_DASH_COOLDOWN;
    this.dashDir = { x: 1, y: 0 };
    this.dashId = 0;
    this.invuln = 0;
    this.hitFlash = 0;
    this.pulseCharge = 0;
    this.overclock = 0;
    this.magnet = 0;
    this.multBoost = 0;
    this.facing = -Math.PI / 2;
    this.trail = [];
    this.trailTimer = 0;
    this.alive = true;
    this.damageTaken = 0;
    this.dashes = 0;
    this.speedLines = 0;
  }

  get speedMultiplier() {
    return this.overclock > 0 ? 1.17 : 1;
  }

  get dashReady() {
    return this.dashCooldown <= 0;
  }

  update(dt, game) {
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.overclock = Math.max(0, this.overclock - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.multBoost = Math.max(0, this.multBoost - dt);

    const input = game.input.getAxis();
    let ax = input.x;
    let ay = input.y;
    if (game.invertActive) {
      ax *= -1;
      ay *= -1;
    }

    if (game.input.consumeDash()) this.tryDash(ax, ay, game);
    if (game.input.consumeAbility()) this.tryPulse(game);

    if (this.dashTimer > 0) {
      this.vx = this.dashDir.x * DASH_SPEED;
      this.vy = this.dashDir.y * DASH_SPEED;
      this.speedLines = 0.18;
    } else {
      const speed = BASE_SPEED * this.speedMultiplier;
      const targetX = ax * speed;
      const targetY = ay * speed;
      const smoothing = 1 - Math.exp(-dt * 15);
      this.vx += (targetX - this.vx) * smoothing;
      this.vy += (targetY - this.vy) * smoothing;
      if (Math.abs(this.vx) < 1 && ax === 0) this.vx = 0;
      if (Math.abs(this.vy) < 1 && ay === 0) this.vy = 0;
      this.speedLines = Math.max(0, this.speedLines - dt);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    game.arena.resolveCircle(this);

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 18) {
      this.facing = Math.atan2(this.vy, this.vx);
    }

    // Positional trail (used for rendering the body's wake).
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    this.trail.push({ x: this.x, y: this.y, life: 0.34, max: 0.34 });
    if (this.trail.length > 26) this.trail.shift();

    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && speed > 40 && game.effectsQuality > 0.4) {
      this.trailTimer = this.dashTimer > 0 ? 0.008 : 0.03;
      game.particles.trail(this.x - this.vx * 0.015, this.y - this.vy * 0.015, {
        color: this.dashTimer > 0 ? this.skin.colors.core : this.skin.colors.primary,
        size: this.dashTimer > 0 ? 4.5 : 2.4,
        life: this.dashTimer > 0 ? 0.35 : 0.25,
        vx: -this.vx * 0.06,
        vy: -this.vy * 0.06,
      });
    }
  }

  tryDash(ax, ay, game) {
    if (this.dashCooldown > 0 || !this.alive) return false;
    let dir = normalize(ax, ay);
    if (dir.len < 0.15) {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 30) dir = normalize(this.vx, this.vy);
      else dir = { x: Math.cos(this.facing), y: Math.sin(this.facing), len: 1 };
    }
    this.dashDir = { x: dir.x, y: dir.y };
    this.dashTimer = DASH_DURATION;
    this.dashCooldown = BASE_DASH_COOLDOWN * (this.overclock > 0 ? 0.55 : 1);
    this.dashCdMax = BASE_DASH_COOLDOWN * (this.overclock > 0 ? 0.55 : 1);
    this.invuln = Math.max(this.invuln, 0.34);
    this.dashId += 1;
    this.dashes += 1;
    this.vx = dir.x * DASH_SPEED;
    this.vy = dir.y * DASH_SPEED;
    game.onPlayerDash(this);
    return true;
  }

  tryPulse(game) {
    if (this.pulseCharge >= 100) {
      game.activatePulse();
      return true;
    }
    game.onPulseDenied();
    return false;
  }

  addCharge(amount) {
    const before = this.pulseCharge;
    this.pulseCharge = Math.min(100, this.pulseCharge + amount);
    return before < 100 && this.pulseCharge >= 100;
  }

  /** Returns 'none' | 'shield' | 'damage'. */
  damage(amount, game) {
    if (!this.alive || this.invuln > 0) return 'none';
    if (this.shieldHits > 0) {
      this.shieldHits -= 1;
      this.invuln = 1.05;
      this.hitFlash = 0.2;
      game.onShieldAbsorb(this);
      return 'shield';
    }
    this.health = Math.max(0, this.health - amount);
    this.damageTaken += amount;
    this.invuln = 1.3;
    this.hitFlash = 0.25;
    game.onPlayerHurt(this, amount);
    if (this.health <= 0) {
      this.alive = false;
    }
    return 'damage';
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  draw(ctx, time, game) {
    const colors = this.skin.colors;
    const blink = this.invuln > 0 && Math.sin(time * 34) > 0 ? 0.5 : 1;

    // Wake trail
    if (game.effectsQuality > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.trail.length; i++) {
        const t = this.trail[i];
        const a = (t.life / t.max) * 0.16 * blink;
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 2 === 0 ? colors.primary : colors.secondary;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 8 * (t.life / t.max) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing + Math.PI / 2);

    // Dash speed lines
    if (this.dashTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = colors.core;
      for (let i = -2; i <= 2; i++) {
        ctx.globalAlpha = 0.25 - Math.abs(i) * 0.04;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(i * 6, 18 + Math.random() * 20);
        ctx.lineTo(i * 6, 44 + Math.random() * 24);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Engine flare
    const flare = 12 + Math.sin(time * 30) * 4;
    const flareGrad = ctx.createLinearGradient(0, 8, 0, 12 + flare);
    flareGrad.addColorStop(0, colors.secondary);
    flareGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.fillStyle = flareGrad;
    ctx.globalAlpha = 0.65 * blink;
    ctx.beginPath();
    ctx.moveTo(-5, 7);
    ctx.lineTo(0, 12 + flare);
    ctx.lineTo(5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = blink;

    // Hull
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = game.effectsQuality > 0.5 ? 20 : 0;
    const hull = ctx.createLinearGradient(0, -18, 0, 14);
    hull.addColorStop(0, colors.core);
    hull.addColorStop(0.35, colors.primary);
    hull.addColorStop(1, 'rgba(12, 10, 30, 0.9)');
    ctx.fillStyle = hull;
    ctx.strokeStyle = colors.core;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(11, 12);
    ctx.lineTo(0, 6);
    ctx.lineTo(-11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Core
    ctx.shadowBlur = 14;
    ctx.shadowColor = colors.secondary;
    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(0, -1, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(0, -1, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Orbit ring
    ctx.strokeStyle = colors.secondary;
    ctx.globalAlpha = 0.55 * blink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 22, time * 1.8, time * 1.8 + 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 22, time * 1.8 + Math.PI, time * 1.8 + Math.PI + 1.7);
    ctx.stroke();
    ctx.globalAlpha = blink;

    // Pulse charge arc
    if (this.pulseCharge > 0) {
      ctx.strokeStyle = this.pulseCharge >= 100 ? '#fbbf24' : colors.secondary;
      ctx.globalAlpha = this.pulseCharge >= 100 ? 0.9 : 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.pulseCharge / 100));
      ctx.stroke();
      ctx.globalAlpha = blink;
    }

    ctx.restore();

    // Shield bubble
    if (this.shieldHits > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = 0.45 + Math.sin(time * 4) * 0.12;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#22d3ee';
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 9]);
      ctx.beginPath();
      ctx.arc(0, 0, 31, time * 1.2, time * 1.2 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Hit flash
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 2;
      ctx.fillStyle = '#ff2d55';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
