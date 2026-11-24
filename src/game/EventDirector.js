/**
 * Event director: schedules warnings and the five arena-wide system events.
 * Uses the run RNG so daily challenges share the same event schedule.
 */

export const EVENTS = [
  { id: 'blackout', name: 'BLACKOUT', sub: 'VISIBILITY COMPROMISED', duration: 9 },
  { id: 'double', name: 'DOUBLE ECHO', sub: 'ECHO OUTPUT DOUBLED', duration: 10 },
  { id: 'glitch', name: 'GLITCH', sub: 'ARENA GEOMETRY UNSTABLE', duration: 10 },
  { id: 'overload', name: 'OVERLOAD', sub: 'MORE ENERGY // FASTER HOSTILES', duration: 10 },
  { id: 'invert', name: 'INVERT', sub: 'MOVEMENT VECTORS REVERSED', duration: 8 },
];

export class EventDirector {
  constructor(game, rng, modeConfig) {
    this.game = game;
    this.rng = rng;
    this.modeConfig = modeConfig;
    this.state = 'idle';
    this.timer = 30;
    this.pending = null;
    this.active = null;
    this.activeTimer = 0;
    this.warningTimer = 0;
    this.warningTick = 1;
    this.lastId = null;
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.pending = null;
    this.active = null;
    this.timer = this.game.difficulty.eventFirstDelay;
    this.activeTimer = 0;
    this.warningTimer = 0;
    this.lastId = null;
    this.game.arena.setGlitch(false);
    this.game.difficulty.overload = false;
    this.game.invertActive = false;
    this.game.ui.hideBanner();
  }

  get blackoutActive() {
    return this.active?.id === 'blackout';
  }

  get invertActive() {
    return this.active?.id === 'invert';
  }

  update(dt) {
    if (this.state === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWarning();
      return;
    }

    if (this.state === 'warning') {
      this.warningTimer -= dt;
      this.warningTick -= dt;
      if (this.warningTick <= 0) {
        this.warningTick = 1;
        this.game.audio.warningTick();
      }
      this.game.ui.updateBanner(Math.max(0, this.warningTimer / 3));
      if (this.warningTimer <= 0) this._activate();
      return;
    }

    if (this.state === 'active') {
      this.activeTimer -= dt;
      this.game.ui.updateBanner(Math.max(0, this.activeTimer / this.active.duration));
      if (this.activeTimer <= 0) this._end();
    }
  }

  _pick() {
    const bias = this.modeConfig.eventBias;
    const pool = EVENTS.filter((e) => e.id !== this.lastId).map((e) => ({
      value: e,
      weight: e.id === bias ? 4.5 : 1,
    }));
    return this.rng.weighted(pool);
  }

  _beginWarning() {
    this.pending = this._pick();
    this.state = 'warning';
    this.warningTimer = 3;
    this.warningTick = 1;
    this.game.ui.showBanner({
      kicker: 'SYSTEM WARNING // INCOMING',
      title: this.pending.name,
      sub: this.pending.sub,
      active: false,
      progress: 1,
    });
    this.game.audio.warning();
    this.game.addShake(2, 0.2);
  }

  _activate() {
    this.active = this.pending;
    this.pending = null;
    this.state = 'active';
    this.activeTimer = this.active.duration;

    this.game.ui.showBanner({
      kicker: 'SYSTEM EVENT // ACTIVE',
      title: this.active.name,
      sub: this.active.sub,
      active: true,
      progress: 1,
    });
    this.game.audio.eventStart();
    this.game.ui.flash(
      this.active.id === 'blackout' ? '#000000' : this.active.id === 'glitch' ? '#a855f7' : '#22d3ee',
      0.16,
    );
    this.game.addShake(4, 0.3);

    switch (this.active.id) {
      case 'double':
        this.game.spawnEcho({ extra: true, corrupted: true, seconds: 6.5 });
        this.game.spawnEcho({ extra: true, corrupted: true, seconds: 6.5 });
        this.game.echoTimer = Math.min(this.game.echoTimer, 2);
        this.game.ui.toast('EVENT // DOUBLE ECHO', 'The past multiplies', 'Extra echoes are replaying corrupted fragments.', 'red', 3200);
        break;
      case 'glitch':
        this.game.arena.setGlitch(true);
        break;
      case 'overload':
        this.game.difficulty.overload = true;
        this.game.spawner.spawnBurstOrbs(this.game, 8);
        this.game.spawner.queueEnemyBurst(3);
        break;
      case 'invert':
        this.game.invertActive = true;
        break;
      case 'blackout':
        this.game.ui.toast('EVENT // BLACKOUT', 'Vision collapsing', 'Stay near the light. Keep moving.', 'red', 3000);
        break;
      default:
        break;
    }
  }

  _end() {
    const ended = this.active;
    if (ended.id === 'glitch') this.game.arena.setGlitch(false);
    if (ended.id === 'overload') this.game.difficulty.overload = false;
    if (ended.id === 'invert') this.game.invertActive = false;

    this.lastId = ended.id;
    this.active = null;
    this.state = 'idle';
    this.timer = this.game.difficulty.eventGap;
    this.game.ui.hideBanner();
    this.game.echoTimer = Math.min(this.game.echoTimer, this.game.echoInterval);
    this.game.audio.ui();
  }

  refreshBanner() {
    if (this.state === 'warning' && this.pending) {
      this.game.ui.showBanner({
        kicker: 'SYSTEM WARNING // INCOMING',
        title: this.pending.name,
        sub: this.pending.sub,
        active: false,
        progress: Math.max(0, this.warningTimer / 3),
      });
    } else if (this.state === 'active' && this.active) {
      this.game.ui.showBanner({
        kicker: 'SYSTEM EVENT // ACTIVE',
        title: this.active.name,
        sub: this.active.sub,
        active: true,
        progress: Math.max(0, this.activeTimer / this.active.duration),
      });
    }
  }
}
