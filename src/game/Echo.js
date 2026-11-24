/**
 * Echo: a deterministic replay of recorded player samples.
 * Playback is driven by elapsed game time and interpolated timestamps, so it
 * is identical on 30, 60 or 144 Hz displays.
 */
import { clamp, lerp } from './Collision.js';

export class Echo {
  constructor(samples, startTime, options = {}) {
    this.samples = samples.length >= 2 ? samples : [
      { t: 0, x: samples[0]?.x ?? 720, y: samples[0]?.y ?? 405, angle: 0, dashing: false },
      { t: 0.2, x: samples[0]?.x ?? 720, y: samples[0]?.y ?? 405, angle: 0, dashing: false },
    ];
    this.startTime = startTime;
    this.startT = this.samples[0].t;
    this.endT = this.samples[this.samples.length - 1].t;
    this.duration = Math.max(0.4, this.endT - this.startT);
    this.elapsed = 0;
    this.dead = false;
    this.index = 0;
    this.x = this.samples[0].x;
    this.y = this.samples[0].y;
    this.prevX = this.x;
    this.prevY = this.y;
    this.angle = this.samples[0].angle || 0;
    this.radius = 12;
    this.alpha = 0;
    this.color = options.color || '#22d3ee';
    this.core = options.core || '#e0faff';
    this.corrupted = Boolean(options.corrupted);
    this.id = options.id ?? Math.random();
    this.trail = [];
    this.corruptCooldowns = new Map();
    this.emitTimer = 0;
    this.glow = 0;
  }

  update(dt, gameTime, game) {
    this.elapsed += dt;
    const targetT = this.startT + this.elapsed;
    const s = this.samples;
    while (this.index < s.length - 2 && s[this.index + 1].t <= targetT) this.index++;
    const a = s[this.index];
    const b = s[Math.min(this.index + 1, s.length - 1)];
    const span = b.t - a.t;
    const f = span > 0.0001 ? clamp((targetT - a.t) / span, 0, 1) : 0;

    this.prevX = this.x;
    this.prevY = this.y;
    this.x = lerp(a.x, b.x, f);
    this.y = lerp(a.y, b.y, f);
    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;
    if (Math.hypot(dx, dy) > 0.2) this.angle = Math.atan2(dy, dx);
    else this.angle = a.angle ?? this.angle;

    const fadeIn = clamp(this.elapsed / 0.18, 0, 1);
    const fadeOut = clamp((this.duration + 1.1 - this.elapsed) / 1.1, 0, 1);
    this.alpha = Math.min(fadeIn, fadeOut);
    this.glow = Math.max(0, this.glow - dt * 2);

    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    this.trail.push({ x: this.x, y: this.y, life: 0.45, max: 0.45 });
    if (this.trail.length > 34) this.trail.shift();

    this.emitTimer -= dt;
    if (this.emitTimer <= 0 && game.effectsQuality > 0.35) {
      this.emitTimer = 0.06;
      game.particles.trail(this.x, this.y, {
        color: this.corrupted ? '#ff2d55' : this.color,
        size: 2.2,
        life: 0.4,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
      });
    }

    if (this.elapsed > this.duration + 1.1) this.dead = true;
  }

  canCorrupt(enemy, gameTime) {
    const last = this.corruptCooldowns.get(enemy.id) ?? -999;
    if (gameTime - last < 0.7) return false;
    this.corruptCooldowns.set(enemy.id, gameTime);
    this.glow = 1;
    return true;
  }

  draw(ctx, time, quality = 1) {
    if (this.alpha <= 0.01) return;
    const color = this.corrupted ? '#ff2d55' : this.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Afterimage trail
    if (quality > 0.3) {
      for (let i = 0; i < this.trail.length; i += 2) {
        const t = this.trail[i];
        const a = (t.life / t.max) * 0.12 * this.alpha;
        ctx.globalAlpha = a;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 6 * (t.life / t.max) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = this.alpha;
    const flicker = 0.82 + Math.sin(time * 18 + this.id) * 0.1;
    const ox = this.corrupted ? Math.sin(time * 40) * 2.5 : Math.sin(time * 6) * 0.8;

    // Ghost body
    ctx.save();
    ctx.translate(this.x + ox, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.09)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = quality > 0.5 ? 16 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(10, 11);
    ctx.lineTo(0, 5);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = this.alpha * 0.75 * flicker;
    ctx.beginPath();
    ctx.arc(0, -1, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = this.core;
    ctx.fill();

    // Scanlines across the ghost
    ctx.globalAlpha = this.alpha * 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6;
    for (let i = -12; i < 12; i += 4) {
      ctx.beginPath();
      ctx.moveTo(-9, i);
      ctx.lineTo(9, i);
      ctx.stroke();
    }
    ctx.restore();

    // Outer ring
    ctx.globalAlpha = this.alpha * (0.32 + this.glow * 0.4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 21 + Math.sin(time * 3 + this.id) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 8]);
    ctx.globalAlpha = this.alpha * 0.3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 27, time * 1.4, time * 1.4 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
