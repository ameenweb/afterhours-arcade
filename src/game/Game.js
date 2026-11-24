/**
 * AFTERHOURS — game controller.
 *
 * Fixed 60 Hz simulation, delta-time movement, an 8 second timestamped
 * recording buffer and deterministic replay echoes. Gameplay timing is driven
 * by simulation time, never by frame counts.
 */
import { Player } from './Player.js';
import { Echo } from './Echo.js';
import { Arena } from './Arena.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Spawner } from './Spawner.js';
import { Difficulty, buildModeConfig } from './Difficulty.js';
import { EchoRecorder } from './EchoRecorder.js';
import { EventDirector } from './EventDirector.js';
import { CombatSystem } from './CombatSystem.js';
import { Renderer } from './Renderer.js';
import { RNG, randomSeed } from '../systems/RNG.js';
import { getDailyChallenge } from '../systems/DailyChallenge.js';

const STEP = 1 / 60;
const ECHO_SECONDS = 8;
const COMBO_WINDOW = 3.6;

export class Game {
  constructor({ canvas, ui, audio, storage, achievements, skins, input }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ui = ui;
    this.audio = audio;
    this.storage = storage;
    this.achievements = achievements;
    this.skins = skins;
    this.input = input;

    const settings = storage.settings;
    this.effectsQuality = settings.reducedMotion || settings.effects === 'low' ? 0.35 : 1;
    this.reducedMotion = Boolean(settings.reducedMotion);
    this.screenShake = Boolean(settings.screenShake) && !settings.reducedMotion;

    this.state = 'menu';
    this.mode = 'classic';
    this.challenge = null;
    this.modeConfig = buildModeConfig('classic');
    this.modeLabel = 'CLASSIC SURVIVAL';
    this.runId = '------';
    this.seed = 1;

    this.visualTime = 0;
    this.gameTime = 0;
    this.runTime = 0;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.menuParticleTimer = 0;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.achievementTimer = 1;

    this.rng = new RNG(1);
    this.arena = new Arena(0x1a2b3c);
    this.difficulty = new Difficulty(this.modeConfig);
    this.spawner = new Spawner(1, this.difficulty);
    this.particles = new ParticleSystem();
    this.particles.quality = this.effectsQuality;
    this.player = new Player(720, 405, this.skins.selected);
    this.recorder = new EchoRecorder();
    this.combat = new CombatSystem(this);
    this.renderer = new Renderer(this);
    this.eventDirector = null;

    this.echoes = [];
    this.orbs = [];
    this.powerups = [];
    this.enemies = [];
    this.projectiles = [];
    this.shockwaves = [];

    this.score = 0;
    this.bestScore = storage.stats.bestScore;
    this.combo = 0;
    this.comboWindow = COMBO_WINDOW;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.echoesSpawned = 0;
    this.echoTimer = 8;
    this.orbsCollected = 0;
    this.kills = 0;
    this.echoKills = 0;
    this.relays = 0;
    this.nextEntityId = 1;
    this.invertActive = false;
    this.countdownTime = 0;
    this.countdownLabel = '3';
    this.countdownShown = null;
    this.pendingStartToast = null;
    this.pulseReadyNotified = false;
    this.relayToastShown = false;
    this.resumeState = 'playing';

    this._onResize = () => this.resize();
    this._onVisibility = () => {
      if (document.hidden && (this.state === 'playing' || this.state === 'countdown')) {
        this.pause();
      }
    };
    this._onKey = (e) => {
      if (this.state === 'gameover' && e.code === 'Enter') {
        e.preventDefault();
        this.retry();
      } else if (this.state === 'gameover' && e.code === 'Escape') {
        e.preventDefault();
        this.quitToMenu();
      } else if (this.state === 'paused' && e.code === 'Enter') {
        e.preventDefault();
        this.resume();
      }
    };
    this.loop = this.loop.bind(this);
  }

  init() {
    this.resize();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('keydown', this._onKey);
    this.input.bindTouchControls({
      joystick: document.getElementById('joystick'),
      knob: document.getElementById('joystick-knob'),
      dashButton: document.getElementById('btn-dash'),
      abilityButton: document.getElementById('btn-ability'),
    });
    this.ui.attach(this);
    this.ui.showMenu();
    this.raf = requestAnimationFrame(this.loop);
  }

  get time() {
    return this.gameTime;
  }

  get multiplier() {
    return Math.min(9, 1 + Math.floor(this.combo / 4) + (this.player.multBoost > 0 ? 1 : 0));
  }

  get echoInterval() {
    const base = this.modeConfig.echoInterval || 8;
    return this.eventDirector?.active?.id === 'double' ? base * 0.5 : base;
  }

  get eventState() {
    return this.eventDirector?.state || 'idle';
  }

  get pendingEvent() {
    return this.eventDirector?.pending || null;
  }

  get activeEvent() {
    return this.eventDirector?.active || null;
  }

  resize() {
    this.renderer.resize();
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (document.hidden) {
      this.audio.tick();
      return;
    }

    this.visualTime += raw;

    if (this.state === 'menu') {
      this._updateMenu(raw);
      this.particles.update(raw);
      this._updateShake(raw);
      this.audio.setIntensity(0.3);
    } else if (this.state === 'playing' || this.state === 'countdown') {
      this.accumulator = Math.min(0.25, this.accumulator + raw);
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps += 1;
      }
      this._updateShake(raw);
      if ((this.state === 'playing' || this.state === 'countdown') && this.input.consumePause()) {
        this.pause();
      }
    } else if (this.state === 'paused') {
      if (this.input.consumePause()) this.resume();
    } else if (this.state === 'gameover') {
      this.particles.update(raw);
      this._updateShake(raw);
      this.audio.setIntensity(0.2);
    }

    this.audio.tick();
    this.renderer.render();
    if (this.state === 'playing' || this.state === 'countdown') this.ui.updateHUD(this);
  }

  update(dt) {
    if (this.state === 'countdown') {
      this._updateCountdown(dt);
      return;
    }
    if (this.state !== 'playing') return;

    this.gameTime += dt;
    this.runTime += dt;
    this.difficulty.update(dt);

    this.player.update(dt, this);
    this.recorder.update(dt, this.player, this.gameTime);
    this.recorder.prune(this.gameTime);
    this._updateEchoes(dt);

    this.arena.update(dt);
    this.arena.updateRelays(dt, [this.player, ...this.echoes], this);

    this.combat.update(dt);
    this.spawner.update(dt, this);
    this.eventDirector.update(dt);

    this._updateCombo(dt);
    this.score += dt * (2 + Math.min(4, this.runTime / 45));

    this.achievementTimer -= dt;
    if (this.achievementTimer <= 0) {
      this.achievementTimer = 1;
      this._evaluateAchievements();
    }

    this.audio.setIntensity(0.45 + Math.min(0.45, this.runTime / 180) + (this.eventDirector.active ? 0.08 : 0));

    if (!this.player.alive) this._finishRun();
  }

  _updateCountdown(dt) {
    this.countdownTime -= dt;
    this.arena.update(dt);
    this.particles.update(dt);
    this._updateShake(dt);

    const label = this.countdownTime > 1.8 ? '3' : this.countdownTime > 1.2 ? '2' : this.countdownTime > 0.6 ? '1' : 'SYNC';
    if (label !== this.countdownShown) {
      this.countdownShown = label;
      this.countdownLabel = label;
      this.ui.countdown(label);
      this.audio.countdownTick(label === 'SYNC');
    }

    if (this.countdownTime <= 0) this._startPlaying();
  }

  start(mode = 'classic', { challenge = null } = {}) {
    const daily = mode === 'daily' ? challenge || getDailyChallenge() : null;
    this.mode = mode;
    this.challenge = daily;
    this.modeConfig = buildModeConfig(mode, daily);
    this.modeLabel = daily ? 'DAILY CHALLENGE' : this.modeConfig.label;

    const seed = daily ? daily.seed : randomSeed();
    this.seed = seed;
    this.rng = new RNG((seed ^ 0x9e3779b9) >>> 0);
    this.runId = seed.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);

    this.arena = new Arena(seed);
    this.difficulty = new Difficulty(this.modeConfig);
    this.spawner = new Spawner((seed ^ 0x51ed270b) >>> 0, this.difficulty);
    this.player = new Player(720, 405, this.skins.selected);
    this.player.reset(720, 405, this.modeConfig.health);
    this.player.maxHealth = this.modeConfig.health;

    this.particles.clear();
    this.particles.quality = this.effectsQuality;
    this.combat = new CombatSystem(this);
    this.recorder = new EchoRecorder();

    this.echoes = [];
    this.orbs = [];
    this.powerups = [];
    this.enemies = [];
    this.projectiles = [];
    this.shockwaves = [];

    this.score = 0;
    this.runTime = 0;
    this.gameTime = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.echoesSpawned = 0;
    this.orbsCollected = 0;
    this.kills = 0;
    this.echoKills = 0;
    this.relays = 0;
    this.nextEntityId = 1;
    this.echoTimer = this.modeConfig.echoInterval;
    this.invertActive = false;
    this.achievementTimer = 1;
    this.pulseReadyNotified = false;
    this.relayToastShown = false;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.bestScore = mode === 'daily' ? this.storage.stats.bestDailyScore : this.storage.stats.bestScore;

    this.eventDirector = new EventDirector(this, this.rng, this.modeConfig);

    this.state = 'countdown';
    this.countdownTime = 2.4;
    this.countdownLabel = '3';
    this.countdownShown = null;
    this.accumulator = 0;
    this.lastTime = performance.now();

    this.pendingStartToast =
      mode === 'daily'
        ? {
            kicker: 'DAILY CHALLENGE',
            title: daily.name,
            desc: `${daily.description} Survive 60 seconds to clear.`,
            type: 'cyan',
            duration: 5200,
          }
        : mode === 'practice'
          ? {
              kicker: 'PRACTICE PROTOCOL',
              title: 'Training mode',
              desc: 'Lower threat. Records and achievements are disabled.',
              type: 'cyan',
              duration: 4200,
            }
          : this.storage.stats.games === 0
            ? {
                kicker: 'SYSTEM BRIEF',
                title: 'Collect. Dash. Survive.',
                desc: 'Every 8 seconds, your last movements replay as an echo.',
                type: 'cyan',
                duration: 5200,
              }
            : null;

    this.ui.countdown('3');
    this.ui.hideBanner();
    this.spawner.seedField(this);
    this.audio.startMusic(0.42);
    this.ui.updateHUD(this);
  }

  _startPlaying() {
    this.state = 'playing';
    this.ui.countdown(null);
    this.gameTime = 0;
    this.runTime = 0;
    this.echoTimer = this.modeConfig.echoInterval;
    this.difficulty.time = 0;
    this.difficulty.level = 1;
    this.recorder.reset(this.player, 0);
    this.eventDirector.reset();
    this.input.clearEdges();
    this.accumulator = 0;
    this.lastTime = performance.now();
    if (this.pendingStartToast) {
      const t = this.pendingStartToast;
      this.pendingStartToast = null;
      this.ui.toast(t.kicker, t.title, t.desc, t.type, t.duration);
    }
  }

  _updateEchoes(dt) {
    this.echoTimer -= dt;
    if (this.echoTimer <= 0) {
      this.spawnEcho();
      this.echoTimer = this.echoInterval;
    }

    for (const echo of this.echoes) {
      if (!echo.dead) echo.update(dt, this.gameTime, this);
    }
    this.echoes = this.echoes.filter((e) => !e.dead);

    if (this.echoes.length > 12) {
      const removed = this.echoes.splice(0, this.echoes.length - 12);
      for (const e of removed) e.dead = true;
    }
  }

  spawnEcho(opts = {}) {
    const seconds = opts.seconds || ECHO_SECONDS;
    const samples = this.recorder.history(this.player, this.gameTime, seconds);
    const echo = new Echo(samples, this.gameTime, {
      color: opts.corrupted ? '#ff2d55' : this.player.skin.colors.secondary,
      core: opts.corrupted ? '#ffd6df' : this.player.skin.colors.core,
      corrupted: Boolean(opts.corrupted),
      id: this.nextEntityId++,
    });
    this.echoes.push(echo);
    this.echoesSpawned += 1;

    if (this.echoes.length > 12) {
      const old = this.echoes.shift();
      old.dead = true;
    }

    this.particles.ring(echo.x, echo.y, {
      maxRadius: 52,
      life: 0.45,
      color: opts.corrupted ? '#ff2d55' : '#22d3ee',
      width: 2,
    });
    this.particles.burst(echo.x, echo.y, {
      count: 14,
      color: opts.corrupted ? '#ff2d55' : '#22d3ee',
      speed: 130,
      size: 2,
      life: 0.45,
      shape: 'spark',
    });
    this.audio.echoSpawn();
    this.addShake(2, 0.14);

    if (!opts.extra && this.echoesSpawned === 1) {
      this.ui.toast(
        'ECHO ONLINE',
        'Your past is replaying',
        'Echoes collect orbs, charge relays and erase hostiles. They also draw enemy fire.',
        'cyan',
        5200,
      );
    }
  }

  _updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = 0;
      this.comboTimer = 0;
    }
  }

  // ---------------------------- RUN LIFECYCLE --------------------------
  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.resumeState = this.state;
    this.state = 'paused';
    this.accumulator = 0;
    this.input.reset();
    this.audio.pauseMusic();
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.resumeState === 'countdown' ? 'countdown' : 'playing';
    this.ui.resumeGameplay();
    this.audio.resumeMusic();
    if (this.state === 'countdown') this.ui.countdown(this.countdownLabel);
    else this.ui.countdown(null);
    this.eventDirector?.refreshBanner();
    this.input.clearEdges();
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  restart() {
    if (this.state === 'menu') return;
    this.ui.startGame(this.mode);
  }

  retry() {
    if (this.state !== 'gameover') return;
    this.ui.startGame(this.mode);
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.reset();
    this.echoes = [];
    this.orbs = [];
    this.powerups = [];
    this.enemies = [];
    this.projectiles = [];
    this.shockwaves = [];
    this.particles.clear();
    this.audio.startMusic(0.3);
    this.ui.showMenu();
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  buildRun() {
    return {
      mode: this.mode,
      score: Math.floor(this.score),
      time: this.runTime,
      orbs: this.orbsCollected,
      echoes: this.echoesSpawned,
      kills: this.kills,
      echoKills: this.echoKills,
      maxCombo: this.maxCombo,
      dashes: this.player.dashes,
      damageTaken: this.player.damageTaken,
      relays: this.relays,
      completedDaily: false,
      date: this.challenge?.date || null,
    };
  }

  _finishRun() {
    if (this.state === 'gameover' || this.state === 'menu') return;
    this.state = 'gameover';
    this.input.reset();
    this.audio.stopMusic();

    const practice = this.mode === 'practice';
    const run = this.buildRun();
    const player = this.player;
    player.alive = false;

    this.particles.burst(player.x, player.y, {
      count: 54,
      color: '#ff2d55',
      speed: 280,
      size: 3,
      life: 0.9,
      shape: 'spark',
    });
    this.particles.ring(player.x, player.y, { maxRadius: 140, life: 0.7, color: '#ff2d55', width: 3 });
    this.addShake(22, 0.6);
    this.ui.flash('#ff2d55', 0.45);

    const previousBest = practice
      ? this.storage.stats.bestScore
      : this.mode === 'daily'
        ? this.storage.stats.bestDailyScore
        : this.storage.stats.bestScore;

    let newBest = false;
    let dailyResult = null;
    let unlocked = [];
    let unlockedSkins = [];

    if (!practice) {
      const completedDaily = this.mode === 'daily' && run.time >= 60;
      run.completedDaily = completedDaily;

      this.storage.recordRun(run);
      newBest = run.score > previousBest && run.score > 0;

      if (this.mode === 'daily' && this.challenge) {
        const entry = this.storage.recordDaily(this.challenge.date, run, completedDaily);
        dailyResult = {
          date: this.challenge.date,
          completed: completedDaily,
          streak: this.storage.stats.dailyStreak,
          best: entry.score,
        };
      }

      unlocked = this.achievements.evaluate(run, this.storage.stats);
      unlockedSkins = this.skins.evaluate();
    }

    const best =
      this.mode === 'daily' ? this.storage.stats.bestDailyScore : this.storage.stats.bestScore;
    this.bestScore = best;

    if (dailyResult?.completed) this.audio.dailyComplete();
    else this.audio.gameOver();

    this.ui.showGameOver({
      run,
      best,
      newBest,
      dailyResult,
      modeLabel: practice ? 'PRACTICE' : this.modeLabel,
      practice,
    });

    this._toastProgress(unlocked, unlockedSkins);
  }

  _evaluateAchievements() {
    if (this.state !== 'playing' || this.mode === 'practice') return;
    const run = this.buildRun();
    const unlocked = this.achievements.evaluate(run, this.storage.stats);
    const unlockedSkins = this.skins.evaluate();
    if (unlocked.length || unlockedSkins.length) this._toastProgress(unlocked, unlockedSkins);
  }

  _toastProgress(unlocked, unlockedSkins) {
    if (unlocked.length) {
      this.audio.achievement();
      for (const def of unlocked.slice(0, 2)) {
        this.ui.toast('ACHIEVEMENT UNLOCKED', def.name, def.desc, 'gold', 4600);
      }
    }
    if (unlockedSkins.length) {
      if (!unlocked.length) this.audio.ui();
      for (const skin of unlockedSkins.slice(0, 2)) {
        this.ui.toast('OPERATIVE UNLOCKED', skin.name, skin.desc, 'cyan', 4200);
      }
    }
  }

  // --------------------------- MENU / SHAKE ----------------------------
  _updateMenu(dt) {
    if (this.effectsQuality < 0.4) return;
    this.menuParticleTimer -= dt;
    if (this.menuParticleTimer > 0) return;
    this.menuParticleTimer = 0.09;
    this.particles.trail(Math.random() * 1440, 830, {
      color: Math.random() > 0.5 ? '#22d3ee' : '#a855f7',
      size: 1.5 + Math.random() * 1.4,
      life: 2.2 + Math.random() * 1.2,
      vx: (Math.random() - 0.5) * 12,
      vy: -16 - Math.random() * 34,
      drag: 1,
    });
  }

  addShake(magnitude, time = 0.2) {
    if (!this.screenShake) return;
    this.shakeMag = Math.max(this.shakeMag, magnitude);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  _updateShake(dt) {
    if (this.shakeTime <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime <= 0) this.shakeMag = 0;
  }

  /** Enemies target the player, but echoes are more attractive than their distance. */
  targetFor(enemy, includeEchoes = true) {
    const player = this.player;
    let target = player.alive ? player : null;
    let best = target ? (target.x - enemy.x) ** 2 + (target.y - enemy.y) ** 2 : Infinity;

    if (includeEchoes) {
      for (const echo of this.echoes) {
        if (echo.dead || echo.alpha < 0.18) continue;
        const dx = echo.x - enemy.x;
        const dy = echo.y - enemy.y;
        const weighted = (dx * dx + dy * dy) * 0.42;
        if (weighted < best) {
          best = weighted;
          target = echo;
        }
      }
    }
    return target;
  }

  // ------------------------- COMBAT DELEGATES --------------------------
  onPlayerDash(player) {
    this.combat.onPlayerDash(player);
  }

  onPlayerHurt(player, amount) {
    this.combat.onPlayerHurt(player, amount);
  }

  onShieldAbsorb(player) {
    this.combat.onShieldAbsorb(player);
  }

  onEnemyDamaged(enemy, source) {
    this.combat.onEnemyDamaged(enemy, source);
  }

  onEnemyKilled(enemy, source) {
    this.combat.onEnemyKilled(enemy, source);
  }

  activatePulse() {
    return this.combat.activatePulse();
  }

  onPulseDenied() {
    this.combat.onPulseDenied();
  }

  spawnEnemyProjectile(enemy, target) {
    this.combat.spawnEnemyProjectile(enemy, target);
  }

  onRelayActivated(relay, actor) {
    this.combat.onRelayActivated(relay, actor);
  }
}
