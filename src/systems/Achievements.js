/**
 * Achievements are pure predicates over a completed run and lifetime stats.
 * They unlock cosmetic skins — never power.
 */

export const ACHIEVEMENTS = [
  {
    id: 'first_contact',
    name: 'FIRST CONTACT',
    desc: 'Complete your first run.',
    icon: '◉',
    check: (run, stats) => stats.games >= 1,
  },
  {
    id: 'survivor',
    name: 'SURVIVOR',
    desc: 'Survive 60 seconds in a single run.',
    icon: '⏱',
    check: (run) => run.time >= 60,
  },
  {
    id: 'endurance',
    name: 'ENDURANCE',
    desc: 'Survive 180 seconds in a single run.',
    icon: '∞',
    check: (run) => run.time >= 180,
  },
  {
    id: 'combo4',
    name: 'CHAIN REACTION',
    desc: 'Reach an x4 combo multiplier.',
    icon: '⛓',
    check: (run) => run.maxCombo >= 4,
  },
  {
    id: 'combo8',
    name: 'OVERCLOCKED',
    desc: 'Reach an x8 combo multiplier.',
    icon: '⚡',
    check: (run) => run.maxCombo >= 8,
  },
  {
    id: 'orbs50',
    name: 'ENERGY BARON',
    desc: 'Collect 50 orbs in one run.',
    icon: '◆',
    check: (run) => run.orbs >= 50,
  },
  {
    id: 'echoes10',
    name: 'ECHO CHAMBER',
    desc: 'Summon 10 echoes in one run.',
    icon: '◎',
    check: (run) => run.echoes >= 10,
  },
  {
    id: 'paradox20',
    name: 'PARADOX ENGINE',
    desc: 'Destroy 20 hostiles with echoes in one run.',
    icon: '⌬',
    check: (run) => run.echoKills >= 20,
  },
  {
    id: 'dash25',
    name: 'BLINK',
    desc: 'Dash 25 times in one run.',
    icon: '»',
    check: (run) => run.dashes >= 25,
  },
  {
    id: 'score5k',
    name: 'HIGH VOLTAGE',
    desc: 'Score 5,000 points.',
    icon: '✦',
    check: (run) => run.score >= 5000,
  },
  {
    id: 'score10k',
    name: 'GRID LEGEND',
    desc: 'Score 10,000 points.',
    icon: '★',
    check: (run) => run.score >= 10000,
  },
  {
    id: 'relays10',
    name: 'CIRCUIT BREAKER',
    desc: 'Charge 10 relay switches in one run.',
    icon: '⬡',
    check: (run) => run.relays >= 10,
  },
  {
    id: 'untouched',
    name: 'UNTOUCHABLE',
    desc: 'Survive 90 seconds without taking damage.',
    icon: '◇',
    check: (run) => run.time >= 90 && run.damageTaken === 0,
  },
  {
    id: 'daily',
    name: 'NIGHT SHIFT',
    desc: 'Complete a daily challenge (60s).',
    icon: '☾',
    check: (run) => run.mode === 'daily' && run.completedDaily,
  },
  {
    id: 'streak3',
    name: 'REGULAR',
    desc: 'Complete dailies on 3 days in a row.',
    icon: '▤',
    check: (run, stats) => stats.dailyStreak >= 3,
  },
];

export class Achievements {
  constructor(storage) {
    this.storage = storage;
    this.definitions = ACHIEVEMENTS;
  }

  get unlockedMap() {
    return this.storage.achievements;
  }

  isUnlocked(id) {
    return Boolean(this.storage.achievements[id]);
  }

  getUnlockedCount() {
    return this.definitions.filter((a) => this.isUnlocked(a.id)).length;
  }

  /** Evaluate every predicate. Returns newly unlocked definitions. */
  evaluate(run, stats = this.storage.stats) {
    if (run.mode === 'practice') return [];
    const unlocked = [];
    for (const def of this.definitions) {
      if (this.isUnlocked(def.id)) continue;
      let passed = false;
      try {
        passed = Boolean(def.check(run, stats));
      } catch {
        passed = false;
      }
      if (passed && this.storage.unlockAchievement(def.id)) {
        unlocked.push(def);
      }
    }
    return unlocked;
  }
}
