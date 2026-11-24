/**
 * Local-only persistence. Everything lives under a versioned key so future
 * migrations can happen without destroying a player's progress.
 */

const KEY = 'afterhours.save.v1';
const VERSION = 1;

export const DEFAULT_SAVE = {
  version: VERSION,
  settings: {
    sound: 0.8,
    music: 0.55,
    effects: 'high',
    reducedMotion: false,
    screenShake: true,
    leftHanded: false,
    keys: { dash: 'Space', ability: 'KeyE' },
  },
  stats: {
    bestScore: 0,
    bestTime: 0,
    bestClassicScore: 0,
    games: 0,
    totalTime: 0,
    totalOrbs: 0,
    totalEchoes: 0,
    totalKills: 0,
    maxCombo: 1,
    bestDailyScore: 0,
    dailyStreak: 0,
    lastDailyDate: null,
    totalDaily: 0,
  },
  achievements: {},
  skins: {
    selected: 'void',
    unlocked: ['void'],
  },
  daily: {
    history: {},
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, incoming) {
  if (!isObject(base) || !isObject(incoming)) return incoming === undefined ? base : incoming;
  const out = clone(base);
  for (const [key, value] of Object.entries(incoming)) {
    if (isObject(value) && isObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function safeStorage() {
  try {
    const test = '__afterhours_test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return null;
  }
}

export class Storage {
  constructor() {
    this.backend = safeStorage();
    this.data = this._load();
  }

  _load() {
    if (!this.backend) return clone(DEFAULT_SAVE);
    try {
      const raw = this.backend.getItem(KEY);
      if (!raw) return clone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw);
      const merged = deepMerge(DEFAULT_SAVE, parsed);
      merged.version = VERSION;
      if (!Array.isArray(merged.skins.unlocked) || merged.skins.unlocked.length === 0) {
        merged.skins.unlocked = ['void'];
      }
      if (!merged.skins.unlocked.includes('void')) merged.skins.unlocked.push('void');
      return merged;
    } catch {
      return clone(DEFAULT_SAVE);
    }
  }

  save() {
    if (!this.backend) return false;
    try {
      this.backend.setItem(KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  get settings() {
    return this.data.settings;
  }

  get stats() {
    return this.data.stats;
  }

  get achievements() {
    return this.data.achievements;
  }

  get skins() {
    return this.data.skins;
  }

  get daily() {
    return this.data.daily;
  }

  updateSettings(patch) {
    this.data.settings = deepMerge(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  updateStats(patch) {
    this.data.stats = deepMerge(this.data.stats, patch);
    this.save();
    return this.data.stats;
  }

  recordRun(run) {
    const s = this.data.stats;
    // Training runs never touch lifetime records or achievement counters.
    if (run.mode === 'practice') return { newBest: false, stats: s };
    s.games += 1;
    s.totalTime += run.time;
    s.totalOrbs += run.orbs;
    s.totalEchoes += run.echoes;
    s.totalKills += run.kills;
    s.maxCombo = Math.max(s.maxCombo, run.maxCombo || 1);

    let newBest = false;
    if (run.mode !== 'practice') {
      if (run.score > s.bestScore) {
        s.bestScore = run.score;
        newBest = true;
      }
      if (run.time > s.bestTime) s.bestTime = run.time;
      if (run.mode === 'classic' && run.score > s.bestClassicScore) {
        s.bestClassicScore = run.score;
      }
      if (run.mode === 'daily' && run.score > s.bestDailyScore) {
        s.bestDailyScore = run.score;
      }
    }

    this.save();
    return { newBest, stats: s };
  }

  recordDaily(dateKey, run, completed) {
    const d = this.data.daily.history[dateKey] || { score: 0, time: 0, completed: false, attempts: 0 };
    d.attempts += 1;
    d.score = Math.max(d.score, run.score);
    d.time = Math.max(d.time, run.time);
    if (completed) {
      const wasComplete = d.completed;
      d.completed = true;
      if (!wasComplete) {
        const s = this.data.stats;
        s.totalDaily += 1;
        const last = s.lastDailyDate;
        const yesterday = previousDateKey(dateKey);
        if (last === yesterday) s.dailyStreak += 1;
        else if (last !== dateKey) s.dailyStreak = 1;
        s.lastDailyDate = dateKey;
      }
    }
    this.data.daily.history[dateKey] = d;

    // Keep only 45 daily entries.
    const keys = Object.keys(this.data.daily.history).sort();
    while (keys.length > 45) {
      delete this.data.daily.history[keys.shift()];
    }

    this.save();
    return d;
  }

  setSkin(id) {
    this.data.skins.selected = id;
    this.save();
  }

  unlockSkin(id) {
    if (!this.data.skins.unlocked.includes(id)) {
      this.data.skins.unlocked.push(id);
      this.save();
      return true;
    }
    return false;
  }

  unlockAchievement(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.save();
    return true;
  }

  reset() {
    this.data = clone(DEFAULT_SAVE);
    this.save();
  }

  export() {
    return clone(this.data);
  }
}

export function previousDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
