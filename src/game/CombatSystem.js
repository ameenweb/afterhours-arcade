/**
 * Combat, pickups, power-ups, relays and the pulse shockwave.
 * Kept separate from the controller so the game loop stays readable.
 */
import { circleCircle, normalize } from './Collision.js';
import { Orb } from './Orb.js';
import { EnemyProjectile } from './Enemy.js';

const CONTACT_DAMAGE = { hunter: 18, interceptor: 15, sentry: 22, glitch: 14 };

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.shockwaves = [];
    game.shockwaves = this.shockwaves;
  }

  reset() {
    this.shockwaves.length = 0;
  }

  update(dt) {
    const game = this.game;
    this._updateShockwaves(dt);
    this._updateOrbs(dt);
    this._updatePowerUps(dt);
    this._updateEnemies(dt);
    this._updateProjectiles(dt);

    game.orbs = game.orbs.filter((o) => !o.collected);
    game.powerups = game.powerups.filter((p) => !p.collected);
    game.enemies = game.enemies.filter((e) => !e.dead);
    game.projectiles = game.projectiles.filter((p) => !p.dead);
    this.shockwaves = this.shockwaves.filter((w) => w.life > 0);
    game.shockwaves = this.shockwaves;
  }

  // ----------------------------- SHOCKWAVE -----------------------------
  activatePulse() {
    const game = this.game;
    const p = game.player;
    if (game.state !== 'playing' || p.pulseCharge < 100) return false;
    p.pulseCharge = 0;
    p.invuln = Math.max(p.invuln, 0.5);
    this.shockwaves.push({
      x: p.x,
      y: p.y,
      radius: 18,
      maxRadius: 330,
      life: 0.55,
      maxLife: 0.55,
      hit: new Set(),
    });
    game.audio.pulse();
    game.addShake(16, 0.45);
    game.ui.flash('#22d3ee', 0.3);
    game.particles.ring(p.x, p.y, { maxRadius: 330, life: 0.6, color: '#22d3ee', width: 4 });
    game.particles.ring(p.x, p.y, { maxRadius: 240, life: 0.45, color: '#a855f7', width: 2 });
    game.particles.burst(p.x, p.y, { count: 28, color: '#22d3ee', speed: 320, size: 3, life: 0.6, shape: 'spark' });
    game.pulseReadyNotified = false;
    return true;
  }

  onPulseDenied() {
    const game = this.game;
    game.audio.denied();
    game.particles.burst(game.player.x, game.player.y, {
      count: 6,
      color: '#a855f7',
      speed: 60,
      size: 1.5,
      life: 0.25,
      shape: 'dot',
    });
  }

  _updateShockwaves(dt) {
    const game = this.game;
    for (const wave of this.shockwaves) {
      wave.life -= dt;
      const t = 1 - Math.max(0, wave.life) / wave.maxLife;
      const eased = 1 - Math.pow(1 - t, 3);
      wave.radius = 18 + (wave.maxRadius - 18) * eased;

      for (const enemy of game.enemies) {
        if (enemy.dead || !enemy.vulnerable || wave.hit.has(enemy.id)) continue;
        const dx = enemy.x - wave.x;
        const dy = enemy.y - wave.y;
        if (dx * dx + dy * dy <= (wave.radius + enemy.radius) ** 2) {
          wave.hit.add(enemy.id);
          const dir = normalize(enemy.x - wave.x, enemy.y - wave.y);
          enemy.x += dir.x * 30;
          enemy.y += dir.y * 30;
          enemy.takeDamage(6, game, 'pulse');
        }
      }

      for (const projectile of game.projectiles) {
        if (projectile.dead) continue;
        const dx = projectile.x - wave.x;
        const dy = projectile.y - wave.y;
        if (dx * dx + dy * dy <= (wave.radius + 12) ** 2) {
          projectile.dead = true;
          game.particles.burst(projectile.x, projectile.y, {
            count: 3,
            color: '#22d3ee',
            speed: 60,
            size: 1.4,
            life: 0.2,
          });
        }
      }
    }
  }

  // ------------------------------- ORBS --------------------------------
  _updateOrbs(dt) {
    const game = this.game;
    for (const orb of game.orbs) {
      if (orb.collected) continue;
      orb.update(dt, game);
      if (circleCircle(orb.x, orb.y, orb.radius, game.player.x, game.player.y, game.player.radius)) {
        this.collectOrb(orb, 'player');
        continue;
      }
      for (const echo of game.echoes) {
        if (echo.dead) continue;
        if (circleCircle(orb.x, orb.y, orb.radius, echo.x, echo.y, echo.radius)) {
          this.collectOrb(orb, 'echo');
          break;
        }
      }
    }
  }

  collectOrb(orb, source) {
    if (orb.collected) return;
    orb.collected = true;
    const game = this.game;
    const p = game.player;
    const prevMult = game.multiplier;
    game.combo += 1;
    game.comboTimer = game.comboWindow;
    game.maxCombo = Math.max(game.maxCombo, game.multiplier);

    const factor = source === 'echo' ? 0.5 : 1;
    const points = Math.max(1, Math.round(orb.value * game.multiplier * factor));
    game.score += points;

    if (source === 'player') {
      game.orbsCollected += 1;
      const ready = p.addCharge(orb.big ? 18 : 7);
      if (orb.big) game.audio.bigOrb(game.multiplier);
      else game.audio.orb(game.multiplier);
      if (ready && !game.pulseReadyNotified) {
        game.pulseReadyNotified = true;
        game.ui.toast('PULSE READY', 'Press E or tap PULSE', 'Clears nearby hostiles and projectiles.', 'gold', 2600);
        game.particles.ring(p.x, p.y, { maxRadius: 60, life: 0.45, color: '#fbbf24', width: 2 });
      }
    } else {
      game.audio.orb(2);
    }

    const color = source === 'echo' ? '#67e8f9' : orb.big ? '#fbbf24' : '#22d3ee';
    game.particles.burst(orb.x, orb.y, {
      count: orb.big ? 18 : 10,
      color,
      speed: orb.big ? 180 : 120,
      size: orb.big ? 3 : 2,
      life: 0.45,
      shape: 'diamond',
    });
    game.particles.text(orb.x, orb.y - 12, source === 'echo' ? `ECHO +${points}` : `+${points}`, {
      color,
      size: orb.big ? 15 : 12,
      life: 0.8,
    });
    if (source === 'player' && orb.big) {
      game.particles.ring(orb.x, orb.y, { maxRadius: 55, life: 0.4, color: '#fbbf24', width: 2 });
      game.addShake(2, 0.12);
    }

    if (game.multiplier > prevMult) {
      game.audio.comboUp(game.multiplier);
      game.particles.text(p.x, p.y - 38, `x${game.multiplier}`, {
        color: '#fbbf24',
        size: 18,
        life: 1,
      });
      game.particles.ring(p.x, p.y, { maxRadius: 46, life: 0.35, color: '#fbbf24', width: 1.5 });
    }
  }

  // ----------------------------- POWER-UPS -----------------------------
  _updatePowerUps(dt) {
    const game = this.game;
    for (const powerup of game.powerups) {
      if (powerup.collected) continue;
      powerup.update(dt);
      if (powerup.collected) continue;
      if (circleCircle(powerup.x, powerup.y, powerup.radius, game.player.x, game.player.y, game.player.radius)) {
        this.applyPowerUp(powerup);
      }
    }
  }

  applyPowerUp(powerup) {
    powerup.collected = true;
    const game = this.game;
    const p = game.player;
    const type = powerup.type;

    switch (type.id) {
      case 'shield':
        p.shieldHits = Math.min(3, p.shieldHits + 1);
        break;
      case 'overclock':
        p.overclock = 8;
        break;
      case 'magnet':
        p.magnet = 8;
        break;
      case 'slow':
        game.difficulty.slowTimer = 5;
        break;
      case 'multiplier':
        p.multBoost = 10;
        break;
      case 'repair':
        p.heal(30);
        break;
      default:
        break;
    }

    game.audio.powerUp();
    game.ui.toast('POWER-UP ACQUIRED', type.name, type.desc, 'cyan', 2500);
    game.particles.burst(powerup.x, powerup.y, {
      count: 22,
      color: type.color,
      speed: 170,
      size: 2.4,
      life: 0.55,
      shape: 'diamond',
    });
    game.particles.ring(powerup.x, powerup.y, {
      maxRadius: 70,
      life: 0.45,
      color: type.color,
      width: 2,
    });
    game.particles.text(p.x, p.y - 26, type.name, { color: type.color, size: 12, life: 0.9 });
  }

  // ------------------------------ ENEMIES ------------------------------
  _updateEnemies(dt) {
    const game = this.game;

    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.update(dt, game);
    }

    // Soft separation so packs read clearly and do not fully overlap.
    for (let i = 0; i < game.enemies.length; i++) {
      const a = game.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < game.enemies.length; j++) {
        const b = game.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius + 4;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.001 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // Player contact: dash erases, otherwise integrity damage.
    for (const enemy of game.enemies) {
      if (enemy.dead || !enemy.vulnerable) continue;
      if (!circleCircle(enemy.x, enemy.y, enemy.radius, game.player.x, game.player.y, game.player.radius)) continue;

      if (game.player.dashTimer > 0 && enemy.lastDashId !== game.player.dashId) {
        enemy.lastDashId = game.player.dashId;
        enemy.takeDamage(4, game, 'dash');
        game.particles.ring(enemy.x, enemy.y, { maxRadius: 46, life: 0.3, color: '#f8f7ff', width: 2 });
        game.addShake(3, 0.16);
      } else if (game.player.invuln <= 0) {
        const result = game.player.damage(CONTACT_DAMAGE[enemy.type] || 18, game);
        if (result !== 'none') {
          const dir = normalize(game.player.x - enemy.x, game.player.y - enemy.y);
          game.player.x += dir.x * 20;
          game.player.y += dir.y * 20;
          enemy.x -= dir.x * 26;
          enemy.y -= dir.y * 26;
          game.arena.resolveCircle(game.player);
          game.arena.resolveCircle(enemy);
        }
      }
    }

    // Echoes corrupt hostiles on contact.
    for (const echo of game.echoes) {
      if (echo.dead) continue;
      for (const enemy of game.enemies) {
        if (enemy.dead || !enemy.vulnerable) continue;
        if (!circleCircle(echo.x, echo.y, echo.radius, enemy.x, enemy.y, enemy.radius)) continue;
        if (!echo.canCorrupt(enemy, game.gameTime)) continue;
        enemy.takeDamage(1, game, 'echo');
        game.particles.burst(enemy.x, enemy.y, {
          count: 8,
          color: '#67e8f9',
          speed: 120,
          size: 2,
          life: 0.35,
          shape: 'spark',
        });
      }
    }
  }

  // ---------------------------- PROJECTILES ----------------------------
  spawnEnemyProjectile(enemy, target) {
    const game = this.game;
    const lead = Math.min(0.7, Math.hypot(target.x - enemy.x, target.y - enemy.y) / 420);
    const tx = target.x + (target.vx || 0) * lead;
    const ty = target.y + (target.vy || 0) * lead;
    const angle = Math.atan2(ty - enemy.y, tx - enemy.x);
    const projectile = new EnemyProjectile(enemy.x, enemy.y, angle, {
      speed: 320,
      damage: 10,
      color: '#ff2d55',
    });
    game.projectiles.push(projectile);
    if (game.projectiles.length > 40) game.projectiles.shift();
    game.audio.enemyShot();
    game.particles.burst(enemy.x, enemy.y, {
      count: 5,
      color: '#ff2d55',
      speed: 90,
      angle,
      spread: 0.8,
      size: 1.6,
      life: 0.25,
      shape: 'spark',
    });
  }

  _updateProjectiles(dt) {
    const game = this.game;
    for (const projectile of game.projectiles) {
      if (projectile.dead) continue;
      projectile.update(dt, game);
    }
  }

  // ------------------------------ EVENTS -------------------------------
  onPlayerDash(player) {
    const game = this.game;
    game.audio.dash();
    game.addShake(3, 0.15);
    const angle = Math.atan2(player.dashDir.y, player.dashDir.x) + Math.PI;
    game.particles.burst(player.x, player.y, {
      count: 14,
      color: player.skin.colors.secondary,
      speed: 230,
      angle,
      spread: 1.2,
      size: 2.4,
      life: 0.35,
      shape: 'spark',
    });
  }

  onPlayerHurt(player, amount) {
    const game = this.game;
    game.audio.hurt();
    game.addShake(13, 0.35);
    game.ui.flash('#ff2d55', 0.3);
    game.particles.burst(player.x, player.y, {
      count: 20,
      color: '#ff2d55',
      speed: 200,
      size: 2.6,
      life: 0.5,
      shape: 'spark',
    });
    game.particles.text(player.x, player.y - 28, `-${amount}`, { color: '#ff2d55', size: 16, life: 0.8 });
  }

  onShieldAbsorb(player) {
    const game = this.game;
    game.audio.shield();
    game.addShake(6, 0.22);
    game.ui.flash('#22d3ee', 0.16);
    game.particles.ring(player.x, player.y, { maxRadius: 70, life: 0.4, color: '#22d3ee', width: 3 });
    game.particles.text(player.x, player.y - 30, 'ABSORBED', { color: '#22d3ee', size: 12, life: 0.8 });
  }

  onEnemyDamaged(enemy) {
    const game = this.game;
    game.particles.burst(enemy.x, enemy.y, {
      count: 4,
      color: enemy.color,
      speed: 80,
      size: 1.4,
      life: 0.25,
      shape: 'spark',
    });
  }

  onEnemyKilled(enemy, source) {
    const game = this.game;
    const factor = source === 'echo' ? 0.75 : 1;
    const points = Math.round(enemy.scoreValue * game.multiplier * factor);
    game.score += points;
    game.kills += 1;
    if (source === 'echo') game.echoKills += 1;

    game.particles.burst(enemy.x, enemy.y, {
      count: enemy.type === 'sentry' ? 34 : 22,
      color: enemy.color,
      speed: enemy.type === 'sentry' ? 260 : 190,
      size: 2.8,
      life: 0.65,
      shape: 'spark',
    });
    game.particles.ring(enemy.x, enemy.y, {
      maxRadius: enemy.type === 'sentry' ? 80 : 50,
      life: 0.4,
      color: enemy.color,
      width: 2,
    });
    game.particles.text(enemy.x, enemy.y - 20, `+${points}`, { color: enemy.color, size: 13, life: 0.7 });
    game.addShake(3, 0.16);
    if (source === 'echo') game.audio.echoKill();
    else game.audio.enemyKill();

    game.achievementTimer = Math.min(game.achievementTimer, 0.25);

    // Small chance to drop a replacement orb.
    if (game.rng.chance(0.16) && game.orbs.length < 28) {
      const pos = game.arena.isBlocked(enemy.x, enemy.y, 14)
        ? game.arena.randomFreePoint(game.rng, { margin: 70, radius: 14 })
        : { x: enemy.x, y: enemy.y };
      game.orbs.push(new Orb(pos.x, pos.y, {
        value: 10,
        phase: game.rng.float(0, Math.PI * 2),
        born: game.gameTime,
      }));
    }
  }

  onRelayActivated(relay, actor) {
    const game = this.game;
    game.relays += 1;
    const points = Math.round(60 * game.multiplier);
    game.score += points;
    game.player.addCharge(12);
    game.audio.relay();
    game.addShake(3, 0.2);
    game.ui.flash('#22d3ee', 0.12);
    game.particles.ring(relay.x, relay.y, { maxRadius: 120, life: 0.55, color: '#22d3ee', width: 3 });
    game.particles.burst(relay.x, relay.y, {
      count: 26,
      color: '#5eead4',
      speed: 200,
      size: 2.5,
      life: 0.6,
      shape: 'diamond',
    });
    game.particles.text(relay.x, relay.y - 36, `RELAY +${points}`, { color: '#5eead4', size: 13, life: 1 });

    for (let i = 0; i < 2; i++) {
      const angle = game.rng.float(0, Math.PI * 2);
      let x = relay.x + Math.cos(angle) * 52;
      let y = relay.y + Math.sin(angle) * 52;
      if (game.arena.isBlocked(x, y, 12)) {
        const p = game.arena.randomFreePoint(game.rng, { margin: 70, radius: 12 });
        x = p.x;
        y = p.y;
      }
      game.orbs.push(new Orb(x, y, { value: 10, phase: game.rng.float(0, Math.PI * 2), born: game.gameTime }));
    }

    if (!game.relayToastShown) {
      game.relayToastShown = true;
      game.ui.toast('RELAY CHARGED', 'Energy cache released', 'Both you and your echoes can charge relays.', 'cyan', 3000);
    }
    game.achievementTimer = Math.min(game.achievementTimer, 0.25);
  }
}
