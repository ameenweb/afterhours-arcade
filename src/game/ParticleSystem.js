/**
 * Pooled particles, expanding rings and floating score text.
 * The pool prevents per-frame allocations and keeps mobile GPUs happy.
 */
import { RNG } from '../systems/RNG.js';

const rng = new RNG(0xa77e2);

export class ParticleSystem {
  constructor(max = 720) {
    this.max = max;
    this.particles = Array.from({ length: max }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      color: '#22d3ee',
      shape: 'dot',
      drag: 0.94,
      gravity: 0,
      rot: 0,
      spin: 0,
      glow: true,
    }));
    this.cursor = 0;
    this.rings = [];
    this.texts = [];
    this.quality = 1;
  }

  _acquire() {
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max;
      if (!this.particles[idx].active) {
        this.cursor = (idx + 1) % this.max;
        return this.particles[idx];
      }
    }
    // Pool full: recycle the oldest cursor slot.
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    return p;
  }

  burst(x, y, opts = {}) {
    const count = Math.max(1, Math.round((opts.count ?? 10) * this.quality));
    const color = opts.color || '#22d3ee';
    const speed = opts.speed ?? 180;
    const size = opts.size ?? 2.6;
    const life = opts.life ?? 0.55;
    const spread = opts.spread ?? Math.PI * 2;
    const angle = opts.angle ?? 0;
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      const a = angle + (spread === Math.PI * 2 ? rng.float(0, Math.PI * 2) : rng.float(-spread / 2, spread / 2));
      const sp = speed * rng.float(0.35, 1);
      p.active = true;
      p.x = x + rng.float(-3, 3);
      p.y = y + rng.float(-3, 3);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = life * rng.float(0.65, 1.2);
      p.maxLife = p.life;
      p.size = size * rng.float(0.5, 1.4);
      p.color = color;
      p.shape = opts.shape || (rng.chance(0.6) ? 'spark' : 'dot');
      p.drag = opts.drag ?? 0.93;
      p.gravity = opts.gravity ?? 0;
      p.rot = rng.float(0, Math.PI * 2);
      p.spin = rng.float(-8, 8);
      p.glow = opts.glow !== false;
    }
  }

  trail(x, y, opts = {}) {
    if (this.quality < 0.6 && rng.chance(0.5)) return;
    const p = this._acquire();
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.life = opts.life ?? 0.32;
    p.maxLife = p.life;
    p.size = opts.size ?? 3;
    p.color = opts.color || '#a855f7';
    p.shape = opts.shape || 'dot';
    p.drag = opts.drag ?? 0.9;
    p.gravity = 0;
    p.rot = rng.float(0, Math.PI * 2);
    p.spin = 0;
    p.glow = opts.glow !== false;
  }

  ring(x, y, opts = {}) {
    this.rings.push({
      x,
      y,
      r: opts.startRadius ?? 4,
      maxR: opts.maxRadius ?? 120,
      life: opts.life ?? 0.5,
      maxLife: opts.life ?? 0.5,
      color: opts.color || '#22d3ee',
      width: opts.width ?? 2,
    });
    if (this.rings.length > 24) this.rings.shift();
  }

  text(x, y, value, opts = {}) {
    this.texts.push({
      x,
      y,
      value,
      life: opts.life ?? 0.9,
      maxLife: opts.life ?? 0.9,
      color: opts.color || '#f8f7ff',
      size: opts.size ?? 13,
      vy: opts.vy ?? -42,
      weight: opts.weight ?? 700,
    });
    if (this.texts.length > 40) this.texts.shift();
  }

  update(dt) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.spin * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - ring.life / ring.maxLife;
      ring.r = ring.r + (ring.maxR - ring.r) * Math.min(1, dt * 9 + t * 0.02);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.96;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (!p.active) continue;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === 'spark') {
        ctx.lineWidth = Math.max(1, p.size * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      } else if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.shape === 'diamond') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const ring of this.rings) {
      const a = Math.max(0, ring.life / ring.maxLife);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(0.5, ring.width * a);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, Math.max(1, ring.r), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (this.texts.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const a = Math.min(1, t.life / (t.maxLife * 0.6));
        ctx.globalAlpha = a;
        ctx.fillStyle = t.color;
        ctx.font = `${t.weight} ${t.size}px "Bahnschrift", "Segoe UI", sans-serif`;
        ctx.fillText(t.value, t.x, t.y);
      }
      ctx.restore();
    }
  }

  clear() {
    for (const p of this.particles) p.active = false;
    this.rings.length = 0;
    this.texts.length = 0;
    this.cursor = 0;
  }
}
