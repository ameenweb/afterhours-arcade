/**
 * Mode definitions and the escalating threat curve.
 * Echoes are the constant; everything else gets harder.
 */

export const MODES = {
  classic: {
    id: 'classic',
    label: 'CLASSIC SURVIVAL',
    short: 'CLASSIC',
    health: 100,
    enemySpeed: 1,
    spawnRate: 1,
    orbRate: 1,
    echoInterval: 8,
    eventRate: 1,
    practice: false,
    record: true,
  },
  daily: {
    id: 'daily',
    label: 'DAILY CHALLENGE',
    short: 'DAILY',
    health: 100,
    enemySpeed: 1,
    spawnRate: 1,
    orbRate: 1,
    echoInterval: 8,
    eventRate: 1,
    practice: false,
    record: true,
  },
  practice: {
    id: 'practice',
    label: 'PRACTICE',
    short: 'PRACTICE',
    health: 125,
    enemySpeed: 0.74,
    spawnRate: 0.72,
    orbRate: 1.2,
    echoInterval: 8,
    eventRate: 0.55,
    practice: true,
    record: false,
  },
};

export function buildModeConfig(mode, challenge = null) {
  const base = { ...(MODES[mode] || MODES.classic) };
  if (mode === 'daily' && challenge) {
    base.label = 'DAILY CHALLENGE';
    base.challengeName = challenge.name;
    base.enemySpeed *= challenge.modifiers.enemySpeed;
    base.orbRate *= challenge.modifiers.orbRate;
    base.eventRate *= challenge.modifiers.eventRate;
    base.echoInterval = challenge.modifiers.echoInterval;
    base.eventBias = challenge.modifiers.eventBias;
  }
  return base;
}

export class Difficulty {
  constructor(modeConfig) {
    this.mode = modeConfig;
    this.time = 0;
    this.level = 1;
    this.overload = false;
    this.slowTimer = 0;
  }

  update(dt) {
    this.time += dt;
    this.level = 1 + Math.floor(this.time / 30);
    if (this.slowTimer > 0) this.slowTimer -= dt;
  }

  get enemySpeedMultiplier() {
    const ramp = 1 + Math.min(0.9, this.time * 0.0052);
    const slow = this.slowTimer > 0 ? 0.42 : 1;
    const overload = this.overload ? 1.32 : 1;
    return this.mode.enemySpeed * ramp * slow * overload;
  }

  get spawnInterval() {
    const base = Math.max(0.72, 3.35 - this.time * 0.019);
    const overload = this.overload ? 0.68 : 1;
    return Math.max(0.45, (base * overload) / this.mode.spawnRate);
  }

  get maxEnemies() {
    const cap = this.mode.practice ? 14 : 22;
    return Math.min(cap, 4 + Math.floor(this.time / 13));
  }

  get orbTarget() {
    const base = 6 + Math.min(9, Math.floor(this.time / 25));
    const overload = this.overload ? 5 : 0;
    return Math.round(base * this.mode.orbRate) + overload;
  }

  get eventFirstDelay() {
    return this.mode.practice ? 46 : 32;
  }

  get eventGap() {
    const base = Math.max(17, 27 - this.time * 0.018);
    return base / Math.max(0.5, this.mode.eventRate);
  }

  get echoInterval() {
    return this.mode.echoInterval;
  }

  get unlockedTypes() {
    const t = this.time + (this.mode.practice ? 14 : 0);
    const types = [{ value: 'hunter', weight: 40 }];
    if (t > 18) types.push({ value: 'interceptor', weight: 27 });
    if (t > 36) types.push({ value: 'sentry', weight: 22 });
    if (t > 56) types.push({ value: 'glitch', weight: 17 });
    return types;
  }

  get powerUpInterval() {
    return this.mode.practice ? 12 : 10;
  }
}
