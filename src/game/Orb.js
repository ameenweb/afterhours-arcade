/** Energy orbs. Echoes can collect them too — that is the point. */

export class Orb {
  constructor(x, y, { big = false, value = 10, phase = 0, born = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.originX = x;
    this.originY = y;
    this.big = big;
    this.value = value;
    this.radius = big ? 13 : 9;
    this.phase = phase;
    this.born = born;
    this.age = 0;
    this.vx = 0;
    this.vy = 0;
    this.collected = false;
    this.color = big ? '#fbbf24' : '#22d3ee';
  }

  update(dt, game) {
    this.age += dt;
    const player = game.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d = Math.hypot(dx, dy);
    const magnetRange = player.magnet > 0 ? 280 : 84;
    if (d < magnetRange && d > 1) {
      const strength = player.magnet > 0 ? 1400 : 260;
      const falloff = 1 - d / magnetRange;
      this.vx += (dx / d) * strength * falloff * dt;
      this.vy += (dy / d) * strength * falloff * dt;
    }
    this.vx *= Math.pow(0.9, dt * 60);
    this.vy *= Math.pow(0.9, dt * 60);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Gentle drift back toward spawn if attracted but not collected.
    if (this.vx === 0 && this.vy === 0) {
      this.x = this.originX + Math.sin(this.age * 0.7 + this.phase) * 2;
      this.y = this.originY + Math.cos(this.age * 0.9 + this.phase) * 3;
    }
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 2.2 + this.phase) * 3;
    const pulse = 1 + Math.sin(time * 4 + this.phase) * 0.12;
    const size = this.radius * pulse;
    const x = this.x;
    const y = this.y + bob;

    ctx.save();
    ctx.translate(x, y);

    // Halo
    const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, size * 3);
    halo.addColorStop(0, this.big ? 'rgba(251, 191, 36, 0.34)' : 'rgba(34, 211, 238, 0.26)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(time * 1.2 + this.phase);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.72, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.72, 0);
    ctx.closePath();
    ctx.fillStyle = this.big ? 'rgba(251, 191, 36, 0.25)' : 'rgba(34, 211, 238, 0.2)';
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.rotate(-time * 1.2 - this.phase);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = '#f8f7ff';
    ctx.fill();

    if (this.big) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, size * 1.9, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
