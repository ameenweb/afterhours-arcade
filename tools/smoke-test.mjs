/**
 * Pure-module smoke tests.
 *
 * These run in plain Node (no browser, no bundler) and cover the deterministic
 * systems that the game leans on: seeded randomness, the daily challenge,
 * echo recording/replay, difficulty pacing, persistence rules, achievements
 * and skin unlocks.
 *
 * Run with: npm run test:smoke
 */

import assert from 'node:assert/strict';

/* --------------------------------------------------------------------------
   Minimal browser shims. Storage touches window.localStorage; the recorder
   and echo only need plain objects.
   -------------------------------------------------------------------------- */

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

const local = new MemoryStorage();
globalThis.window = { localStorage: local };

const { RNG, xmur3, mulberry32 } = await import('../src/systems/RNG.js');
const { utcDateKey, getDailyChallenge, formatDailyDate } = await import(
  '../src/systems/DailyChallenge.js'
);
const { EchoRecorder } = await import('../src/game/EchoRecorder.js');
const { Echo } = await import('../src/game/Echo.js');
const { Difficulty, MODES, buildModeConfig } = await import('../src/game/Difficulty.js');
const { Storage, previousDateKey } = await import('../src/systems/Storage.js');
const { ACHIEVEMENTS, Achievements } = await import('../src/systems/Achievements.js');
const { SKINS, Skins } = await import('../src/systems/Skins.js');

/* --------------------------------------------------------------------------
   Tiny harness
   -------------------------------------------------------------------------- */

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message}`);
  }
}

function approx(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

function fakePlayer(x = 100, y = 100, facing = 0, dashTimer = 0) {
  return { x, y, facing, dashTimer };
}

console.log('\nAFTERHOURS smoke tests\n');

/* --------------------------------------------------------------------------
   RNG
   -------------------------------------------------------------------------- */

test('xmur3 is stable for a given string', () => {
  assert.equal(xmur3('AFTERHOURS::2026-11-24')(), xmur3('AFTERHOURS::2026-11-24')());
  assert.notEqual(xmur3('a')(), xmur3('b')());
});

test('mulberry32 repeats its sequence for the same seed', () => {
  const a = mulberry32(123456);
  const b = mulberry32(123456);
  for (let i = 0; i < 25; i++) assert.equal(a(), b());
});

test('RNG output stays in range and is reproducible', () => {
  const a = new RNG('repeatable-seed');
  const b = new RNG('repeatable-seed');
  for (let i = 0; i < 200; i++) {
    const value = a.next();
    assert.equal(value, b.next());
    assert.ok(value >= 0 && value < 1);
  }
});

test('RNG int, pick and shuffle respect their contracts', () => {
  const rng = new RNG(42);
  for (let i = 0; i < 500; i++) {
    const n = rng.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
  }
  const list = ['a', 'b', 'c', 'd'];
  assert.ok(list.includes(rng.pick(list)));
  const shuffled = rng.shuffle(list);
  assert.deepEqual(shuffled.slice().sort(), list.slice().sort());
  assert.deepEqual(list, ['a', 'b', 'c', 'd'], 'shuffle must not mutate its input');
});

test('RNG weighted selection only returns declared values', () => {
  const rng = new RNG('weights');
  const entries = [
    { value: 'common', weight: 70 },
    { value: 'rare', weight: 25 },
    { value: 'epic', weight: 5 },
  ];
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(rng.weighted(entries));
  assert.ok(seen.has('common'));
  assert.ok([...seen].every((value) => ['common', 'rare', 'epic'].includes(value)));
});

/* --------------------------------------------------------------------------
   Daily challenge
   -------------------------------------------------------------------------- */

test('UTC date key ignores local time', () => {
  assert.equal(utcDateKey(new Date('2026-11-24T23:59:59Z')), '2026-11-24');
  assert.equal(utcDateKey(new Date('2026-11-25T00:00:00Z')), '2026-11-25');
});

test('daily challenge is stable for the same UTC date', () => {
  const a = getDailyChallenge(new Date('2026-11-24T08:00:00Z'));
  const b = getDailyChallenge(new Date('2026-11-24T22:30:00Z'));
  assert.equal(a.date, '2026-11-24');
  assert.equal(a.seed, b.seed);
  assert.equal(a.seed, 1083905105);
  assert.equal(a.name, 'TUESDAY BLACKOUT');
  assert.equal(a.modifiers.eventBias, 'blackout');
});

test('daily challenge changes across dates', () => {
  const monday = getDailyChallenge(new Date('2026-11-23T12:00:00Z'));
  const tuesday = getDailyChallenge(new Date('2026-11-24T12:00:00Z'));
  assert.notEqual(monday.seed, tuesday.seed);
  assert.notEqual(monday.name, tuesday.name);
});

test('all seven weekday variants are defined', () => {
  const names = new Set();
  for (let day = 23; day <= 29; day++) {
    const challenge = getDailyChallenge(new Date(`2026-11-${day}T12:00:00Z`));
    names.add(challenge.name);
    assert.equal(challenge.dayIndex, new Date(`2026-11-${day}T12:00:00Z`).getUTCDay());
  }
  assert.equal(names.size, 7);
});

test('daily modifiers are applied to the mode config', () => {
  const challenge = getDailyChallenge(new Date('2026-11-27T12:00:00Z')); // Friday
  const config = buildModeConfig('daily', challenge);
  assert.equal(config.id, 'daily');
  assert.equal(config.challengeName, challenge.name);
  approx(config.enemySpeed, MODES.daily.enemySpeed * challenge.modifiers.enemySpeed, 1e-9, 'enemy speed');
  approx(config.orbRate, MODES.daily.orbRate * challenge.modifiers.orbRate, 1e-9, 'orb rate');
  assert.equal(config.echoInterval, challenge.modifiers.echoInterval);
  assert.equal(config.eventBias, challenge.modifiers.eventBias);
});

test('formatDailyDate formats in UTC', () => {
  const label = formatDailyDate(new Date('2026-11-24T23:30:00Z'));
  assert.ok(label.includes('Nov'));
  assert.ok(label.includes('24'));
});

/* --------------------------------------------------------------------------
   Echo recorder
   -------------------------------------------------------------------------- */

test('recorder samples at roughly 30 Hz from simulation time', () => {
  const recorder = new EchoRecorder();
  const player = fakePlayer();
  recorder.reset(player, 0);
  for (let i = 0; i < 60; i++) {
    player.x += 2;
    recorder.update(1 / 60, player, (i + 1) / 60);
  }
  assert.equal(recorder.samples.length, 31, 'one second at 30 Hz plus the initial sample');
  assert.ok(recorder.samples.every((sample, index, all) => index === 0 || sample.t > all[index - 1].t));
});

test('recorder memory stays bounded and prune drops old samples', () => {
  const recorder = new EchoRecorder();
  const player = fakePlayer();
  recorder.reset(player, 0);
  for (let i = 0; i < 60 * 60; i++) {
    const t = i / 60;
    player.x = Math.sin(t) * 100;
    player.y = Math.cos(t) * 100;
    recorder.update(1 / 60, player, t);
    recorder.prune(t);
  }
  assert.ok(recorder.samples.length <= 300, `expected bounded buffer, got ${recorder.samples.length}`);
  const oldest = recorder.samples[0].t;
  assert.ok(oldest >= 60 - 8 - 2.1, `oldest sample ${oldest} should be within the retention window`);
});

test('history ends at the current time and spans at most 8 seconds', () => {
  const recorder = new EchoRecorder();
  const player = fakePlayer();
  recorder.reset(player, 0);
  for (let i = 0; i < 60 * 12; i++) {
    const t = i / 60;
    player.x = t * 10;
    recorder.update(1 / 60, player, t);
  }
  const gameTime = 12;
  const history = recorder.history(player, gameTime);
  assert.ok(history.length >= 2);
  assert.ok(history[history.length - 1].t >= gameTime - 0.05);
  assert.ok(history[0].t >= gameTime - 8 - 0.05);
  assert.ok(history.every((sample, index, all) => index === 0 || sample.t >= all[index - 1].t));
});

/* --------------------------------------------------------------------------
   Echo playback
   -------------------------------------------------------------------------- */

function sampleTrack(count = 240, seconds = 8) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * seconds;
    samples.push({
      t,
      x: 300 + Math.sin(t * 1.7) * 220,
      y: 240 + Math.cos(t * 1.1) * 150,
      angle: t * 0.4,
      dashing: i % 47 === 0,
    });
  }
  return samples;
}

const inertGame = { effectsQuality: 0, particles: { trail() {} } };

test('echo playback is deterministic for the same step sequence', () => {
  const track = sampleTrack();
  const a = new Echo(track, 0, { id: 1 });
  const b = new Echo(track, 0, { id: 1 });
  for (let i = 0; i < 120; i++) {
    a.update(1 / 60, i / 60, inertGame);
    b.update(1 / 60, i / 60, inertGame);
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
  }
  assert.equal(a.dead, false);
});

test('echo playback is frame-rate independent', () => {
  const track = sampleTrack();
  const at60 = new Echo(track, 0, { id: 2 });
  const at144 = new Echo(track, 0, { id: 2 });
  for (let i = 0; i < 120; i++) at60.update(1 / 60, i / 60, inertGame);
  for (let i = 0; i < 288; i++) at144.update(1 / 144, i / 144, inertGame);
  approx(at60.x, at144.x, 0.35, 'x after 2s');
  approx(at60.y, at144.y, 0.35, 'y after 2s');
});

test('echo fades in, expires and reports dead', () => {
  const track = sampleTrack(30, 1);
  const echo = new Echo(track, 0, { id: 3 });
  echo.update(0.1, 0.1, inertGame);
  assert.ok(echo.alpha > 0);
  for (let i = 0; i < 200; i++) echo.update(1 / 60, i / 60, inertGame);
  assert.equal(echo.dead, true);
  assert.equal(echo.alpha, 0);
});

test('single-sample echoes get a safe two-point fallback', () => {
  const echo = new Echo([{ t: 4, x: 50, y: 60, angle: 0, dashing: false }], 0, { id: 4 });
  assert.equal(echo.samples.length, 2);
  echo.update(1 / 60, 0, inertGame);
  approx(echo.x, 50, 0.001, 'fallback x');
  approx(echo.y, 60, 0.001, 'fallback y');
});

test('corruption cooldown is enforced per enemy', () => {
  const echo = new Echo(sampleTrack(10, 1), 0, { id: 5 });
  assert.equal(echo.canCorrupt({ id: 'a' }, 10), true);
  assert.equal(echo.canCorrupt({ id: 'a' }, 10.2), false);
  assert.equal(echo.canCorrupt({ id: 'a' }, 11), true);
  assert.equal(echo.canCorrupt({ id: 'b' }, 11), true);
});

/* --------------------------------------------------------------------------
   Difficulty
   -------------------------------------------------------------------------- */

test('difficulty escalates over time but stays capped', () => {
  const difficulty = new Difficulty(buildModeConfig('classic'));
  const earlySpeed = difficulty.enemySpeedMultiplier;
  const earlySpawn = difficulty.spawnInterval;
  const earlyEnemies = difficulty.maxEnemies;
  difficulty.update(300);
  assert.ok(difficulty.enemySpeedMultiplier > earlySpeed);
  assert.ok(difficulty.enemySpeedMultiplier <= 2.5);
  assert.ok(difficulty.spawnInterval < earlySpawn);
  assert.ok(difficulty.spawnInterval >= 0.45);
  assert.ok(difficulty.maxEnemies > earlyEnemies);
  assert.ok(difficulty.maxEnemies <= 22);
  assert.equal(difficulty.level, 11);
});

test('practice mode is slower and caps enemies lower', () => {
  const classic = new Difficulty(buildModeConfig('classic'));
  const practice = new Difficulty(buildModeConfig('practice'));
  classic.update(300);
  practice.update(300);
  assert.ok(practice.enemySpeedMultiplier < classic.enemySpeedMultiplier);
  assert.ok(practice.spawnInterval > classic.spawnInterval);
  assert.ok(practice.maxEnemies < classic.maxEnemies);
  assert.ok(practice.eventFirstDelay > classic.eventFirstDelay);
});

test('overload and slow modifiers change pacing', () => {
  const difficulty = new Difficulty(buildModeConfig('classic'));
  difficulty.update(30);
  const base = difficulty.enemySpeedMultiplier;
  difficulty.overload = true;
  approx(difficulty.enemySpeedMultiplier, base * 1.32, 1e-9, 'overload speed');
  difficulty.slowTimer = 1;
  approx(difficulty.enemySpeedMultiplier, base * 1.32 * 0.42, 1e-9, 'slowed overload speed');
  difficulty.update(1.1);
  assert.equal(difficulty.slowTimer <= 0, true);
});

test('enemy types unlock on schedule', () => {
  const difficulty = new Difficulty(buildModeConfig('classic'));
  difficulty.update(1);
  assert.deepEqual(difficulty.unlockedTypes.map((entry) => entry.value), ['hunter']);
  difficulty.update(20);
  assert.ok(difficulty.unlockedTypes.some((entry) => entry.value === 'interceptor'));
  difficulty.update(40);
  assert.ok(difficulty.unlockedTypes.some((entry) => entry.value === 'sentry'));
  difficulty.update(40);
  assert.ok(difficulty.unlockedTypes.some((entry) => entry.value === 'glitch'));
});

/* --------------------------------------------------------------------------
   Storage
   -------------------------------------------------------------------------- */

function freshStorage() {
  local.clear();
  return new Storage();
}

function runFixture(overrides = {}) {
  return {
    mode: 'classic',
    score: 1000,
    time: 42,
    orbs: 12,
    echoes: 3,
    kills: 7,
    echoKills: 1,
    maxCombo: 2,
    dashes: 4,
    relays: 2,
    damageTaken: 10,
    completedDaily: false,
    ...overrides,
  };
}

test('storage starts from defaults and persists updates', () => {
  const storage = freshStorage();
  assert.equal(storage.stats.games, 0);
  assert.equal(storage.skins.selected, 'void');
  storage.updateSettings({ sound: 0.3 });
  const reloaded = new Storage();
  assert.equal(reloaded.settings.sound, 0.3);
  assert.equal(reloaded.settings.music, 0.55, 'unspecified settings keep defaults');
});

test('practice runs never touch records or lifetime counters', () => {
  const storage = freshStorage();
  const before = JSON.stringify(storage.stats);
  const result = storage.recordRun(runFixture({ mode: 'practice', score: 99999 }));
  assert.equal(result.newBest, false);
  assert.equal(JSON.stringify(storage.stats), before);
});

test('classic runs update records and report new bests', () => {
  const storage = freshStorage();
  const first = storage.recordRun(runFixture({ score: 1200 }));
  assert.equal(first.newBest, true);
  assert.equal(storage.stats.bestScore, 1200);
  assert.equal(storage.stats.bestClassicScore, 1200);
  assert.equal(storage.stats.games, 1);
  assert.equal(storage.stats.totalOrbs, 12);
  const second = storage.recordRun(runFixture({ score: 900 }));
  assert.equal(second.newBest, false);
  assert.equal(storage.stats.bestScore, 1200);
  assert.equal(storage.stats.games, 2);
});

test('daily records only count best score and completion', () => {
  const storage = freshStorage();
  storage.recordDaily('2026-11-24', runFixture({ score: 800 }), false);
  storage.recordDaily('2026-11-24', runFixture({ score: 1200 }), true);
  const entry = storage.daily.history['2026-11-24'];
  assert.equal(entry.score, 1200);
  assert.equal(entry.attempts, 2);
  assert.equal(entry.completed, true);
  assert.equal(storage.stats.totalDaily, 1);
  assert.equal(storage.stats.dailyStreak, 1);
});

test('daily streak increments on consecutive days and resets after a gap', () => {
  const storage = freshStorage();
  storage.recordDaily('2026-11-20', runFixture(), true);
  storage.recordDaily('2026-11-21', runFixture(), true);
  storage.recordDaily('2026-11-22', runFixture(), true);
  assert.equal(storage.stats.dailyStreak, 3);
  assert.equal(storage.stats.totalDaily, 3);
  storage.recordDaily('2026-11-25', runFixture(), true);
  assert.equal(storage.stats.dailyStreak, 1);
  assert.equal(storage.stats.totalDaily, 4);
});

test('re-completing the same daily does not double count', () => {
  const storage = freshStorage();
  storage.recordDaily('2026-11-24', runFixture(), true);
  storage.recordDaily('2026-11-24', runFixture({ score: 5000 }), true);
  assert.equal(storage.stats.totalDaily, 1);
  assert.equal(storage.stats.dailyStreak, 1);
});

test('previousDateKey handles month and year boundaries', () => {
  assert.equal(previousDateKey('2026-03-01'), '2026-02-28');
  assert.equal(previousDateKey('2024-03-01'), '2024-02-29');
  assert.equal(previousDateKey('2026-01-01'), '2025-12-31');
});

test('daily history is capped at 45 entries', () => {
  const storage = freshStorage();
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    storage.recordDaily(date, runFixture(), false);
  }
  assert.equal(Object.keys(storage.daily.history).length, 45);
});

test('skin selection is guarded by unlock state', () => {
  const storage = freshStorage();
  const achievements = new Achievements(storage);
  const skins = new Skins(storage, achievements);
  assert.equal(skins.selectedId, 'void');
  assert.equal(skins.select('ember'), false);
  storage.unlockSkin('ember');
  assert.equal(skins.select('ember'), true);
  assert.equal(skins.selectedId, 'ember');
  assert.equal(skins.select('unknown-skin'), false);
});

test('corrupt save data falls back to defaults', () => {
  local.clear();
  local.setItem('afterhours.save.v1', '{not json');
  const storage = new Storage();
  assert.equal(storage.stats.games, 0);
  assert.equal(storage.skins.selected, 'void');
});

/* --------------------------------------------------------------------------
   Achievements and skins
   -------------------------------------------------------------------------- */

test('practice runs unlock no achievements', () => {
  const storage = freshStorage();
  const achievements = new Achievements(storage);
  const unlocked = achievements.evaluate(runFixture({ mode: 'practice', score: 99999, time: 999 }));
  assert.deepEqual(unlocked, []);
  assert.equal(achievements.getUnlockedCount(), 0);
});

test('achievement predicates unlock on qualifying runs', () => {
  const storage = freshStorage();
  const achievements = new Achievements(storage);
  storage.recordRun(runFixture({ score: 6000, time: 65, maxCombo: 4, orbs: 50 }));
  const unlocked = achievements.evaluate(
    runFixture({ score: 6000, time: 65, maxCombo: 4, orbs: 50 }),
    storage.stats,
  );
  const ids = unlocked.map((def) => def.id);
  assert.ok(ids.includes('first_contact'));
  assert.ok(ids.includes('survivor'));
  assert.ok(ids.includes('combo4'));
  assert.ok(ids.includes('orbs50'));
  assert.ok(ids.includes('score5k'));
  assert.ok(!ids.includes('endurance'));
  assert.ok(ids.includes('daily') === false);
});

test('achievement unlocks are idempotent', () => {
  const storage = freshStorage();
  const achievements = new Achievements(storage);
  storage.recordRun(runFixture());
  achievements.evaluate(runFixture(), storage.stats);
  const count = achievements.getUnlockedCount();
  achievements.evaluate(runFixture(), storage.stats);
  assert.equal(achievements.getUnlockedCount(), count);
});

test('achievement definitions have unique ids and callable checks', () => {
  const ids = new Set();
  for (const def of ACHIEVEMENTS) {
    assert.ok(def.id && def.name && def.desc);
    assert.equal(ids.has(def.id), false, `duplicate achievement id ${def.id}`);
    ids.add(def.id);
    assert.equal(typeof def.check, 'function');
  }
  assert.equal(ids.size, 15);
});

test('skins unlock from achievements and lifetime stats', () => {
  const storage = freshStorage();
  const achievements = new Achievements(storage);
  const skins = new Skins(storage, achievements);
  storage.updateStats({ games: 10 });
  const unlocked = skins.evaluate();
  const ids = unlocked.map((skin) => skin.id);
  assert.ok(ids.includes('obsidian'));
  assert.ok(skins.isUnlocked('obsidian'));
});

test('every skin requirement references a real achievement', () => {
  const achievementIds = new Set(ACHIEVEMENTS.map((def) => def.id));
  for (const skin of SKINS) {
    assert.ok(skin.id && skin.name && skin.colors);
    if (skin.req?.type === 'achievement') {
      assert.ok(achievementIds.has(skin.req.id), `unknown achievement ${skin.req.id}`);
    }
  }
});

test('storage reset restores defaults', () => {
  const storage = freshStorage();
  storage.recordRun(runFixture({ score: 4321 }));
  storage.unlockAchievement('survivor');
  storage.reset();
  assert.equal(storage.stats.games, 0);
  assert.equal(storage.stats.bestScore, 0);
  assert.equal(storage.achievements.survivor, undefined);
});

/* --------------------------------------------------------------------------
   Result
   -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  process.exitCode = 1;
}
