import { RNG } from '../systems/RNG.js';
import { Orb } from './Orb.js';
import { PowerUp, POWERUP_TYPES } from './PowerUp.js';
import { Enemy } from './Enemy.js';

/** Owns orb / power-up / enemy cadence. All randomness flows through one RNG. */
export class Spawner {
  constructor(seed, difficulty) {
    this.rng = new RNG(seed >>> 0);
    this.difficulty = difficulty;
    this.orbTimer = 0;
    this.powerTimer = difficulty.powerUpInterval;
    this.enemyTimer = 1.4;
    this.enemyBurstTimer = 0;
    this.burstQueue = 0;
  }

  seedField(game) {
    const count = Math.min(9, this.difficulty.orbTarget);
    for (let i = 0; i < count; i++) this.spawnOrb(game, { initial: true });
    // Start with one power-up already in the field for early discovery.
    this.spawnPowerUp(game, { initial: true });
  }

  update(dt, game) {
    const d = this.difficulty;

    this.orbTimer -= dt;
    if (game.orbs.length < d.orbTarget && this.orbTimer <= 0) {
      this.spawnOrb(game);
      this.orbTimer = this.rng.float(0.35, 0.8);
    }

    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      if (game.powerups.length < 2) this.spawnPowerUp(game);
      this.powerTimer = d.powerUpInterval + this.rng.float(-1.5, 1.5);
    }

    this.enemyTimer -= dt;
    if (game.enemies.length < d.maxEnemies && this.enemyTimer <= 0) {
      this.spawnEnemy(game);
      this.enemyTimer = d.spawnInterval * this.rng.float(0.78, 1.22);
    }

    if (this.enemyBurstTimer > 0) {
      this.enemyBurstTimer -= dt;
      if (this.enemyBurstTimer <= 0) {
        if (this.burstQueue > 0) {
          this.spawnEnemy(game, { burst: true });
          this.burstQueue -= 1;
          this.enemyBurstTimer = this.burstQueue > 0 ? 0.45 : 0;
        } else {
          this.enemyBurstTimer = 0;
        }
      }
    }
  }

  spawnOrb(game, opts = {}) {
    const arena = game.arena;
    const big = !opts.initial && this.rng.chance(0.09);
    const avoid = [{ x: game.player.x, y: game.player.y, radius: game.player.radius }];
    for (const e of game.enemies) avoid.push({ x: e.x, y: e.y, radius: 40 });
    const point = arena.randomFreePoint(this.rng, {
      margin: 70,
      radius: 16,
      avoid,
      minDist: opts.initial ? 90 : 80,
    });
    const orb = new Orb(point.x, point.y, {
      big,
      value: big ? 28 : 10,
      phase: this.rng.float(0, Math.PI * 2),
      born: game.time,
    });
    game.orbs.push(orb);
    if (!opts.silent) {
      game.particles.burst(point.x, point.y, {
        count: 4,
        color: big ? '#fbbf24' : '#22d3ee',
        speed: 40,
        size: 1.8,
        life: 0.3,
        shape: 'dot',
      });
    }
    return orb;
  }

  spawnBurstOrbs(game, count) {
    for (let i = 0; i < count; i++) this.spawnOrb(game, { silent: true });
  }

  spawnPowerUp(game, opts = {}) {
    const arena = game.arena;
    const point = arena.randomFreePoint(this.rng, {
      margin: 90,
      radius: 18,
      avoid: [{ x: game.player.x, y: game.player.y, radius: 100 }],
      minDist: 70,
    });
    const pool = POWERUP_TYPES.map((t) => ({ value: t, weight: t.weight }));
    const type = this.rng.weighted(pool);
    const powerup = new PowerUp(point.x, point.y, type, {
      phase: this.rng.float(0, Math.PI * 2),
    });
    game.powerups.push(powerup);
    if (!opts.initial) {
      game.particles.burst(point.x, point.y, {
        count: 10,
        color: type.color,
        speed: 90,
        size: 2,
        life: 0.5,
        shape: 'diamond',
      });
    }
    return powerup;
  }

  spawnEnemy(game, opts = {}) {
    const arena = game.arena;
    const type = this.rng.weighted(this.difficulty.unlockedTypes);
    const avoid = [
      { x: game.player.x, y: game.player.y, radius: 280 },
      ...game.echoes.map((e) => ({ x: e.x, y: e.y, radius: 60 })),
    ];
    const point = arena.randomFreePoint(this.rng, {
      margin: 80,
      radius: 24,
      avoid,
      minDist: 140,
    });
    const enemy = new Enemy(type, point.x, point.y, {
      speedMul: this.difficulty.enemySpeedMultiplier,
      hpBonus: Math.floor(this.difficulty.time / 75),
      phase: this.rng.float(0, Math.PI * 2),
      rng: this.rng,
      id: game.nextEntityId++,
    });
    game.enemies.push(enemy);
    game.particles.burst(point.x, point.y, {
      count: 9,
      color: enemy.color,
      speed: 110,
      size: 2,
      life: 0.45,
      shape: 'spark',
    });
    game.particles.ring(point.x, point.y, {
      maxRadius: 38,
      life: 0.4,
      color: enemy.color,
      width: 1.5,
    });
    return enemy;
  }

  /** OVERLOAD support: spawn several enemies over the next few seconds. */
  queueEnemyBurst(count = 3) {
    this.burstQueue += Math.max(0, Math.floor(count));
    if (this.enemyBurstTimer <= 0 && this.burstQueue > 0) this.enemyBurstTimer = 0.35;
  }
}
