/** Temporary power-ups. Never permanent stat upgrades. */

export const POWERUP_TYPES = [
  {
    id: 'shield',
    name: 'SHIELD',
    color: '#22d3ee',
    weight: 22,
    desc: 'Absorbs the next hit.',
  },
  {
    id: 'overclock',
    name: 'OVERCLOCK',
    color: '#fbbf24',
    weight: 20,
    desc: 'Faster movement and dash recharge.',
  },
  {
    id: 'magnet',
    name: 'MAGNET',
    color: '#c4b5fd',
    weight: 18,
    desc: 'Pulls orbs toward you.',
  },
  {
    id: 'slow',
    name: 'FRACTURE',
    color: '#818cf8',
    weight: 16,
    desc: 'Slows every hostile.',
  },
  {
    id: 'multiplier',
    name: 'AMPLIFIER',
    color: '#f472b6',
    weight: 14,
    desc: 'Adds +1 to your combo multiplier.',
  },
  {
    id: 'repair',
    name: 'REPAIR',
    color: '#4ade80',
    weight: 14,
    desc: 'Restores 30 integrity.',
  },
];

const byId = Object.fromEntries(POWERUP_TYPES.map((t) => [t.id, t]));

export class PowerUp {
  constructor(x, y, type, { phase = 0 } = {}) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.phase = phase;
    this.age = 0;
    this.life = 16;
    this.radius = 17;
    this.collected = false;
    this.color = type.color;
  }

  update(dt) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) this.collected = true;
  }

  draw(ctx, time) {
    const fade = this.life < 3 ? (Math.sin(time * 16) > -0.2 ? 1 : 0.25) : 1;
    const bob = Math.sin(time * 2 + this.phase) * 3;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(this.x, this.y + bob);

    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 42);
    halo.addColorStop(0, `${this.color}44`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(time * 0.7 + this.phase);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * 19;
      const py = Math.sin(a) * 19;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(8, 8, 18, 0.82)';
    ctx.fill();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.rotate(-time * 0.7 - this.phase);
    this._drawIcon(ctx);
    ctx.restore();
  }

  _drawIcon(ctx) {
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (this.type.id) {
      case 'shield': {
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(8, -5);
        ctx.lineTo(7, 4);
        ctx.lineTo(0, 10);
        ctx.lineTo(-7, 4);
        ctx.lineTo(-8, -5);
        ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'overclock': {
        ctx.beginPath();
        ctx.moveTo(1, -10);
        ctx.lineTo(-6, 1);
        ctx.lineTo(0, 1);
        ctx.lineTo(-1, 10);
        ctx.lineTo(7, -2);
        ctx.lineTo(1, -2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'magnet': {
        ctx.beginPath();
        ctx.arc(0, 1, 7, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7, 1);
        ctx.lineTo(-7, 7);
        ctx.moveTo(7, 1);
        ctx.lineTo(7, 7);
        ctx.stroke();
        break;
      }
      case 'slow': {
        ctx.beginPath();
        ctx.moveTo(-6, -8);
        ctx.lineTo(6, -8);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, 8);
        ctx.lineTo(-6, 8);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'multiplier': {
        ctx.font = '700 11px "Bahnschrift", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('x2', 0, 1);
        break;
      }
      case 'repair': {
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(7, 0);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 7);
        ctx.stroke();
        break;
      }
      default:
        break;
    }
  }
}

export function getPowerUpType(id) {
  return byId[id];
}
