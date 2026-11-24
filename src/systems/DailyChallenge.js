/**
 * Daily challenge generation.
 * The seed is derived from the UTC calendar date, so every player receives
 * the same arena, spawn stream and event schedule on a given day.
 */
import { RNG, xmur3 } from './RNG.js';

const DAYS = [
  {
    name: 'SUNDAY PROTOCOL',
    tag: 'BALANCED',
    desc: 'A clean arena. Standard threat curve.',
    mods: { enemySpeed: 1, orbRate: 1, eventRate: 1, echoInterval: 8, eventBias: null },
  },
  {
    name: 'MONDAY OVERCLOCK',
    tag: 'FAST',
    desc: 'Hostiles run hotter. Energy is plentiful.',
    mods: { enemySpeed: 1.14, orbRate: 1.3, eventRate: 1, echoInterval: 8, eventBias: null },
  },
  {
    name: 'TUESDAY BLACKOUT',
    tag: 'DARK',
    desc: 'Blackout events are more frequent.',
    mods: { enemySpeed: 1.04, orbRate: 1, eventRate: 1.12, echoInterval: 8, eventBias: 'blackout' },
  },
  {
    name: 'WEDNESDAY FRACTURE',
    tag: 'UNSTABLE',
    desc: 'The arena glitches. Geometry cannot be trusted.',
    mods: { enemySpeed: 1.02, orbRate: 1, eventRate: 1.25, echoInterval: 8, eventBias: 'glitch' },
  },
  {
    name: 'THURSDAY INVERSION',
    tag: 'REVERSED',
    desc: 'Invert events are weighted heavily.',
    mods: { enemySpeed: 1.04, orbRate: 1, eventRate: 1.1, echoInterval: 8, eventBias: 'invert' },
  },
  {
    name: 'FRIDAY OVERLOAD',
    tag: 'INTENSE',
    desc: 'Energy surge. Faster hostiles. No rest.',
    mods: { enemySpeed: 1.18, orbRate: 1.45, eventRate: 1.1, echoInterval: 8, eventBias: 'overload' },
  },
  {
    name: 'SATURDAY ECHO STORM',
    tag: 'ECHOES',
    desc: 'Echoes arrive faster. The past crowds you.',
    mods: { enemySpeed: 1.05, orbRate: 1.05, eventRate: 1, echoInterval: 6.5, eventBias: 'double' },
  },
];

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function getDailyChallenge(date = new Date()) {
  const key = utcDateKey(date);
  const dayIndex = date.getUTCDay();
  const config = DAYS[dayIndex];
  const seedString = `AFTERHOURS::${key}`;
  const seed = xmur3(seedString)();
  const rng = new RNG(seed);
  const variant = rng.int(0, 9999);
  return {
    date: key,
    dayIndex,
    seed,
    seedString,
    variant,
    name: config.name,
    tag: config.tag,
    description: config.desc,
    modifiers: { ...config.mods },
    echoInterval: config.mods.echoInterval,
    label: `${key} · ${config.name}`,
  };
}

export function formatDailyDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
