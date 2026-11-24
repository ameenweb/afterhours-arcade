/**
 * Arena geometry, neon grid rendering and the relay switches that both the
 * player and echoes can charge.
 */
import { RNG } from '../systems/RNG.js';
import { clamp, circleRect, resolveCircleRect } from './Collision.js';

const W = 1440;
const H = 810;

export class Relay {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 32;
    this.charge = 0;
    this.cooldown = 0;
    this.rot = Math.random() * Math.PI * 2;
    this.flash = 0;
    this.activatedBy = null;
  }

  update(dt, actors, game) {
    this.rot += dt * 0.5;
    if (this.flash > 0) this.flash -= dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.charge = Math.max(0, this.charge - dt * 0.5);
      return;
    }

    let touching = null;
    for (const actor of actors) {
      if (!actor) continue;
      const dx = actor.x - this.x;
      const dy = actor.y - this.y;
      const r = this.radius + (actor.radius || 10);
      if (dx * dx + dy * dy <= r * r) {
        touching = actor;
        break;
      }
    }

    if (touching) {
      this.charge = Math.min(1, this.charge + dt * 0.85);
      if (this.charge >= 1) {
        this.charge = 0;
        this.cooldown = 7;
        this.flash = 0.8;
        this.activatedBy = touching;
        if (game) game.onRelayActivated(this, touching);
      }
    } else {
      this.charge = Math.max(0, this.charge - dt * 0.22);
    }
  }

  draw(ctx, time) {
    const active = this.cooldown > 0;
    const color = active ? '#5eead4' : '#22d3ee';
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.globalAlpha = 0.2 + this.charge * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 10 + Math.sin(time * 2 + this.rot) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Hexagonal pad
    ctx.rotate(this.rot);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * this.radius;
      const py = Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = active ? 'rgba(94, 234, 212, 0.09)' : 'rgba(34, 211, 238, 0.045)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(94, 234, 212, 0.85)' : 'rgba(34, 211, 238, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Charge arc
    ctx.rotate(-this.rot);
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.charge);
    ctx.strokeStyle = this.charge >= 1 ? '#fbbf24' : color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#5eead4' : color;
    ctx.fill();
    if (this.charge > 0.02 || this.flash > 0) {
      ctx.globalAlpha = 0.12 + this.charge * 0.22;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * (0.6 + this.charge * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class Arena {
  constructor(seed = 1) {
    this.width = W;
    this.height = H;
    this.margin = 46;
    this.rng = new RNG((seed >>> 0) ^ 0x9e3779b9);
    this.time = 0;
    this.glitchActive = false;
    this.tempObstacles = [];

    const base = [
      { x: 260, y: 178, w: 170, h: 26 },
      { x: 1010, y: 178, w: 170, h: 26 },
      { x: 620, y: 252, w: 200, h: 26 },
      { x: 620, y: 532, w: 200, h: 26 },
      { x: 198, y: 556, w: 26, h: 150 },
      { x: 1216, y: 556, w: 26, h: 150 },
      { x: 700, y: 78, w: 40, h: 64 },
      { x: 690, y: 700, w: 60, h: 26 },
    ];

    const candidates = [
      { x: 468, y: 390, w: 26, h: 120 },
      { x: 946, y: 390, w: 26, h: 120 },
      { x: 600, y: 648, w: 150, h: 26 },
      { x: 690, y: 136, w: 150, h: 26 },
    ];

    const obstacles = base.map((o) => {
      const shiftX = this.rng.chance(0.65) ? this.rng.float(-46, 46) : 0;
      const shiftY = this.rng.chance(0.5) ? this.rng.float(-26, 26) : 0;
      return { ...o, x: o.x + shiftX, y: o.y + shiftY };
    });

    const extras = this.rng.shuffle(candidates).slice(0, this.rng.int(1, 2));
    for (const extra of extras) obstacles.push({ ...extra });

    this.obstacles = obstacles.map((o) => ({
      ...o,
      baseX: o.x,
      baseY: o.y,
      x: o.x,
      y: o.y,
      targetX: o.x,
      targetY: o.y,
      glitchX: o.x,
      glitchY: o.y,
    }));

    this.relays = [new Relay(300, 405), new Relay(1140, 405)];
    this._buildGlitchTargets();
    this._buildTempObstacles();
  }

  _buildGlitchTargets() {
    for (const o of this.obstacles) {
      o.glitchX = o.baseX + this.rng.float(-110, 110);
      o.glitchY = o.baseY + this.rng.float(-60, 60);
      o.glitchX = clamp(o.glitchX, this.margin + 10, this.width - this.margin - o.w - 10);
      o.glitchY = clamp(o.glitchY, this.margin + 10, this.height - this.margin - o.h - 10);
    }
  }

  _buildTempObstacles() {
    const a = this.rng.chance(0.5);
    this.tempObstacles = [
      { x: a ? 470 : 940, y: 250, w: 26, h: 140, alpha: 0, targetAlpha: 0 },
      { x: a ? 940 : 470, y: 430, w: 26, h: 140, alpha: 0, targetAlpha: 0 },
    ];
  }

  setGlitch(active) {
    this.glitchActive = active;
    for (const o of this.obstacles) {
      o.targetX = active ? o.glitchX : o.baseX;
      o.targetY = active ? o.glitchY : o.baseY;
    }
    for (const o of this.tempObstacles) o.targetAlpha = active ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    const t = 1 - Math.exp(-dt * 5);
    for (const o of this.obstacles) {
      o.x += (o.targetX - o.x) * t;
      o.y += (o.targetY - o.y) * t;
    }
    for (const o of this.tempObstacles) {
      o.alpha += (o.targetAlpha - o.alpha) * (1 - Math.exp(-dt * 8));
    }
    // Keep the temporary obstacles around so every GLITCH event can reuse them.
  }

  allObstacles() {
    return [...this.obstacles, ...this.tempObstacles.filter((o) => o.alpha > 0.15)];
  }

  resolveCircle(entity) {
    let hit = false;
    for (const o of this.allObstacles()) {
      if (resolveCircleRect(entity, o)) hit = true;
    }
    entity.x = clamp(entity.x, this.margin, this.width - this.margin);
    entity.y = clamp(entity.y, this.margin, this.height - this.margin);
    return hit;
  }

  isBlocked(x, y, radius = 12) {
    for (const o of this.allObstacles()) {
      if (circleRect(x, y, radius, o)) return true;
    }
    return false;
  }

  randomFreePoint(rng, { margin = 80, radius = 18, avoid = [], minDist = 0 } = {}) {
    for (let i = 0; i < 60; i++) {
      const x = rng.float(margin, this.width - margin);
      const y = rng.float(margin, this.height - margin);
      if (this.isBlocked(x, y, radius + 8)) continue;
      let ok = true;
      for (const p of avoid) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < (minDist + (p.radius || 0)) ** 2) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  updateRelays(dt, actors, game) {
    for (const relay of this.relays) relay.update(dt, actors, game);
  }

  // ----------------------------- RENDERING ------------------------------
  drawFloor(ctx, time, reduced = false) {
    const { width: w, height: h } = this;
    ctx.save();

    const bg = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.72);
    bg.addColorStop(0, '#0c0b22');
    bg.addColorStop(0.55, '#090817');
    bg.addColorStop(1, '#05050d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Static grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(88, 28, 135, 0.22)';
    ctx.beginPath();
    for (let x = 0; x <= w; x += 72) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += 72) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Brighter traveling grid pulses
    const pulse = (time * 34) % 72;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.075)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = -72 + pulse; x <= w; x += 72) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = -72 + pulse; y <= h; y += 72) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Central sigil
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.035);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 210, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([8, 22]);
    ctx.beginPath();
    ctx.arc(0, 0, 265, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 150, Math.sin(a) * 150);
      ctx.lineTo(Math.cos(a) * 210, Math.sin(a) * 210);
      ctx.stroke();
    }
    ctx.restore();

    // Hazard corners
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.28)';
    ctx.lineWidth = 2;
    const c = 34;
    const m = 22;
    const corners = [
      [m, m, 1, 1],
      [w - m, m, -1, 1],
      [m, h - m, 1, -1],
      [w - m, h - m, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * c);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * c, y);
      ctx.stroke();
    }

    // Arena border
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.18)';
    ctx.strokeRect(32, 32, w - 64, h - 64);

    if (!reduced) {
      // Slow sweeping scan line
      const sy = ((time * 28) % (h + 120)) - 60;
      const grad = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0)');
      grad.addColorStop(0.5, 'rgba(34, 211, 238, 0.035)');
      grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, sy - 60, w, 120);
    }

    ctx.restore();
  }

  drawObstacles(ctx, time) {
    for (const o of this.allObstacles()) {
      const alpha = o.alpha === undefined ? 1 : o.alpha;
      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = 'rgba(14, 12, 34, 0.94)';
      ctx.fillRect(o.x, o.y, o.w, o.h);

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.62)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, o.w - 1, o.h - 1);

      // Top edge energy
      const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
      grad.addColorStop(0, 'rgba(34, 211, 238, 0.15)');
      grad.addColorStop(0.5, 'rgba(34, 211, 238, 0.8)');
      grad.addColorStop(1, 'rgba(168, 85, 247, 0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(o.x, o.y, o.w, 2);

      // Inner hatching
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = o.x + 8; x < o.x + o.w; x += 12) {
        ctx.moveTo(x, o.y + 4);
        ctx.lineTo(x, o.y + o.h - 4);
      }
      ctx.stroke();

      // Corner accents
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
      ctx.lineWidth = 2;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y + s);
      ctx.lineTo(o.x, o.y);
      ctx.lineTo(o.x + s, o.y);
      ctx.moveTo(o.x + o.w - s, o.y + o.h);
      ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.lineTo(o.x + o.w, o.y + o.h - s);
      ctx.stroke();

      ctx.restore();
    }
  }

  drawRelays(ctx, time) {
    for (const relay of this.relays) relay.draw(ctx, time);
  }
}
