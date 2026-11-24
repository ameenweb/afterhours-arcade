/**
 * Four hostile programs with distinct steering brains.
 * Hunter chases. Interceptor predicts. Sentry patrols and shoots. Glitch
 * refuses to move in a straight line.
 */
import { circleCircle, clamp, normalize } from './Collision.js';

const DEFS = {
  hunter: {
    radius: 15,
    speed: 126,
    hp: 1,
    color: '#ff2d55',
    score: 35,
    name: 'HUNTER',
  },
  interceptor: {
    radius: 13,
    speed: 164,
    hp: 1,
    color: '#22d3ee',
    score: 48,
    name: 'INTERCEPTOR',
  },
  sentry: {
    radius: 20,
    speed: 62,
    hp: 3,
    color: '#a855f7',
    score: 75,
    name: 'SENTRY',
  },
  glitch: {
    radius: 14,
    speed: 154,
    hp: 1,
    color: '#fbbf24',
    score: 58,
    name: 'GLITCH',
  },
};

export class Enemy {
  constructor(type, x, y, opts = {}) {
    const def = DEFS[type] || DEFS.hunter;
    this.type = type;
    this.id = opts.id ?? Math.random();
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = def.radius;
    this.speed = def.speed * (opts.speedMul || 1);
    this.hp = def.hp + (opts.hpBonus || 0);
    this.maxHp = this.hp;
    this.color = def.color;
    this.scoreValue = def.score;
    this.name = def.name;
    this.angle = 0;
    this.spawnAnim = 0.55;
    this.hitFlash = 0;
    this.dead = false;
    this.phase = opts.phase || 0;
    this.rng = opts.rng;
    this.fireTimer = 1.2 + this._rand() * 1.4;
    this.waypoint = null;
    this.glitchTimer = 0;
    this.blinkCooldown = 2.5;
    this.lastDashId = -1;
    this.sentryCharge = 0;
    this.trail = [];
    this.age = 0;
  }

  get spawnAlpha() {
    return clamp(1 - this.spawnAnim / 0.55, 0, 1);
  }

  get vulnerable() {
    return this.spawnAnim <= 0.2 && !this.dead;
  }

  /** Gameplay randomness uses the run RNG so daily runs stay deterministic. */
  _rand() {
    return this.rng ? this.rng.next() : Math.random();
  }

  update(dt, game) {
    this.age += dt;
    this.spawnAnim = Math.max(0, this.spawnAnim - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.fireTimer -= dt;
    this.blinkCooldown -= dt;

    if (this.type === 'hunter') this._updateHunter(dt, game);
    else if (this.type === 'interceptor') this._updateInterceptor(dt, game);
    else if (this.type === 'sentry') this._updateSentry(dt, game);
    else this._updateGlitch(dt, game);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (game.arena.resolveCircle(this)) {
      this.vx *= -0.25;
      this.vy *= -0.25;
    }

    this.x = clamp(this.x, game.arena.margin + 4, game.arena.width - game.arena.margin - 4);
    this.y = clamp(this.y, game.arena.margin + 4, game.arena.height - game.arena.margin - 4);

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 10) this.angle = Math.atan2(this.vy, this.vx);

    this.trail.push({ x: this.x, y: this.y, life: 0.22, max: 0.22 });
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    if (this.trail.length > 14) this.trail.shift();
  }

  _steer(tx, ty, dt, turn = 3.4) {
    const dir = normalize(tx - this.x, ty - this.y);
    const desiredX = dir.x * this.speed;
    const desiredY = dir.y * this.speed;
    const smoothing = 1 - Math.exp(-dt * turn);
    this.vx += (desiredX - this.vx) * smoothing;
    this.vy += (desiredY - this.vy) * smoothing;
  }

  _updateHunter(dt, game) {
    const target = game.targetFor(this, true);
    if (target) this._steer(target.x, target.y, dt, 3.2);
  }

  _updateInterceptor(dt, game) {
    const p = game.player;
    const lead = 0.55;
    const tx = p.x + p.vx * lead;
    const ty = p.y + p.vy * lead;
    this._steer(tx, ty, dt, 4.1);
  }

  _updateSentry(dt, game) {
    if (!this.waypoint) this._pickWaypoint(game);
    const dx = this.waypoint.x - this.x;
    const dy = this.waypoint.y - this.y;
    if (dx * dx + dy * dy < 900) this._pickWaypoint(game);
    if (this.waypoint) this._steer(this.waypoint.x, this.waypoint.y, dt, 1.8);

    const target = game.targetFor(this, true);
    if (target) {
      const dist = Math.hypot(target.x - this.x, target.y - this.y);
      if (dist < 620) {
        this.sentryCharge = 1;
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        if (this.fireTimer <= 0) {
          this.fireTimer = 2.2;
          game.spawnEnemyProjectile(this, target);
        }
      } else {
        this.sentryCharge = 0;
      }
    }
  }

  _pickWaypoint(game) {
    this.waypoint = game.arena.randomFreePoint(this.rng, {
      margin: 90,
      radius: this.radius + 12,
      avoid: [{ x: this.x, y: this.y, radius: 80 }],
    });
  }

  _updateGlitch(dt, game) {
    this.glitchTimer -= dt;
    if (this.glitchTimer <= 0) {
      this.glitchTimer = 0.25 + this._rand() * 0.55;
      const target = game.targetFor(this, this._rand() < 0.6);
      if (target && this._rand() < 0.7) {
        this._steer(target.x + (this._rand() - 0.5) * 220, target.y + (this._rand() - 0.5) * 220, dt, 5.5);
      } else {
        const a = this._rand() * Math.PI * 2;
        this.vx = Math.cos(a) * this.speed;
        this.vy = Math.sin(a) * this.speed;
      }
    }

    // Occasional short blink toward the player.
    if (this.blinkCooldown <= 0 && this._rand() < 0.5) {
      const p = game.player;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d > 160 && d < 520) {
        const dir = normalize(p.x - this.x, p.y - this.y);
        const step = 74;
        this.x += dir.x * step;
        this.y += dir.y * step;
        this.blinkCooldown = 3.4;
        game.particles.burst(this.x, this.y, {
          count: 10,
          color: '#fbbf24',
          speed: 120,
          size: 2,
          life: 0.3,
          shape: 'square',
        });
      } else {
        this.blinkCooldown = 1.5;
      }
    }
  }

  takeDamage(amount, game, source = 'player') {
    if (!this.vulnerable) return false;
    this.hp -= amount;
    this.hitFlash = 0.14;
    if (this.hp <= 0) {
      this.dead = true;
      game.onEnemyKilled(this, source);
      return true;
    }
    game.onEnemyDamaged(this, source);
    return false;
  }

  draw(ctx, time, quality = 1) {
    const alpha = this.spawnAlpha;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    // Spawn-in ring
    if (this.spawnAnim > 0) {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 18 * (1 - alpha), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    const flash = this.hitFlash > 0;
    const color = flash ? '#ffffff' : this.color;

    if (this.type === 'hunter') {
      this._drawHunter(ctx, time, color, quality);
    } else if (this.type === 'interceptor') {
      this._drawInterceptor(ctx, time, color, quality);
    } else if (this.type === 'sentry') {
      this._drawSentry(ctx, time, color, quality);
    } else {
      this._drawGlitch(ctx, time, color, quality);
    }

    ctx.restore();
  }

  _drawHunter(ctx, time, color, quality) {
    ctx.save();
    ctx.rotate(this.angle + Math.PI / 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = quality > 0.5 ? 14 : 0;
    ctx.fillStyle = 'rgba(255, 45, 85, 0.14)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(-11, -11, 22, 22);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-this.angle - Math.PI / 4);

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + Math.sin(time * 5 + this.phase) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawInterceptor(ctx, time, color, quality) {
    ctx.save();
    ctx.rotate(this.angle);
    ctx.shadowColor = color;
    ctx.shadowBlur = quality > 0.5 ? 14 : 0;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#f472b6';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-2, 5);
    ctx.moveTo(8, 0);
    ctx.lineTo(-2, -5);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(3, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawSentry(ctx, time, color, quality) {
    ctx.save();
    ctx.rotate(time * 0.8 + this.phase);
    ctx.shadowColor = color;
    ctx.shadowBlur = quality > 0.5 ? 16 : 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * this.radius;
      const py = Math.sin(a) * this.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-time * 0.8 - this.phase);

    // Turret
    ctx.rotate(this.angle);
    ctx.fillStyle = color;
    ctx.fillRect(0, -3, 21, 6);
    ctx.rotate(-this.angle);

    ctx.fillStyle = this.sentryCharge ? '#f8f7ff' : color;
    ctx.beginPath();
    ctx.arc(0, 0, 5 + Math.sin(time * 6) * 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // HP pips
    if (this.maxHp > 1) {
      for (let i = 0; i < this.maxHp; i++) {
        ctx.fillStyle = i < this.hp ? color : 'rgba(168, 85, 247, 0.18)';
        ctx.fillRect(-this.maxHp * 4 + i * 8, this.radius + 8, 5, 2);
      }
    }
  }

  _drawGlitch(ctx, time, color, quality) {
    const jitterX = Math.sin(time * 40 + this.phase) * 2.2;
    const jitterY = Math.cos(time * 31 + this.phase) * 1.6;
    ctx.save();
    ctx.translate(jitterX, jitterY);
    ctx.globalCompositeOperation = 'lighter';

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-9 + jitterX, -9, 18, 18);
    ctx.fillStyle = '#ff2d55';
    ctx.fillRect(-9 - jitterX, -9 - jitterY, 18, 18);

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = quality > 0.5 ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(-11, -11);
    ctx.lineTo(11, -11);
    ctx.lineTo(11, 6);
    ctx.lineTo(4, 6);
    ctx.lineTo(4, 11);
    ctx.lineTo(-11, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
}

export class EnemyProjectile {
  constructor(x, y, angle, { speed = 320, damage = 10, color = '#ff2d55' } = {}) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 6;
    this.damage = damage;
    this.color = color;
    this.life = 4;
    this.dead = false;
    this.trail = [];
    this.angle = angle;
  }

  update(dt, game) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.trail.push({ x: this.x, y: this.y, life: 0.2 });
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    if (this.trail.length > 12) this.trail.shift();

    if (
      this.life <= 0 ||
      this.x < game.arena.margin ||
      this.x > game.arena.width - game.arena.margin ||
      this.y < game.arena.margin ||
      this.y > game.arena.height - game.arena.margin ||
      game.arena.isBlocked(this.x, this.y, this.radius)
    ) {
      this.dead = true;
      game.particles.burst(this.x, this.y, {
        count: 5,
        color: this.color,
        speed: 80,
        size: 1.6,
        life: 0.3,
        shape: 'spark',
      });
      return;
    }

    if (circleCircle(this.x, this.y, this.radius, game.player.x, game.player.y, game.player.radius)) {
      const result = game.player.damage(this.damage, game);
      if (result !== 'none') {
        this.dead = true;
        game.particles.burst(this.x, this.y, {
          count: 8,
          color: this.color,
          speed: 100,
          size: 2,
          life: 0.35,
        });
      }
    }
  }

  draw(ctx, time, quality = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.trail) {
      ctx.globalAlpha = t.life * 2.6;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = quality > 0.5 ? 14 : 0;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
