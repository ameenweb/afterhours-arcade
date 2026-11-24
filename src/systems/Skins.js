/**
 * Cosmetic operative skins. Each one is unlocked by a gameplay achievement or
 * a lifetime milestone. No purchases, no timers, no stat advantages.
 */

export const SKINS = [
  {
    id: 'void',
    name: 'VOID RUNNER',
    desc: 'The original operative. Nothing to prove.',
    req: null,
    colors: { primary: '#a855f7', secondary: '#22d3ee', core: '#f5f3ff', glow: '#a855f7' },
  },
  {
    id: 'ember',
    name: 'EMBER',
    desc: 'Unlocked by surviving 60 seconds.',
    req: { type: 'achievement', id: 'survivor' },
    colors: { primary: '#fb7185', secondary: '#fbbf24', core: '#fff7ed', glow: '#fb7185' },
  },
  {
    id: 'wraith',
    name: 'CYAN WRAITH',
    desc: 'Unlocked by summoning 10 echoes in one run.',
    req: { type: 'achievement', id: 'echoes10' },
    colors: { primary: '#22d3ee', secondary: '#a5f3fc', core: '#ecfeff', glow: '#22d3ee' },
  },
  {
    id: 'solar',
    name: 'SOLAR FLARE',
    desc: 'Unlocked by scoring 10,000 points.',
    req: { type: 'achievement', id: 'score10k' },
    colors: { primary: '#fbbf24', secondary: '#fb923c', core: '#fffbeb', glow: '#fbbf24' },
  },
  {
    id: 'prism',
    name: 'PRISM',
    desc: 'Unlocked by reaching an x8 combo.',
    req: { type: 'achievement', id: 'combo8' },
    colors: { primary: '#f472b6', secondary: '#818cf8', core: '#ffffff', glow: '#f472b6' },
  },
  {
    id: 'glitch',
    name: 'NULL SIGNAL',
    desc: 'Unlocked by completing a daily challenge.',
    req: { type: 'achievement', id: 'daily' },
    colors: { primary: '#4ade80', secondary: '#fbbf24', core: '#f0fdf4', glow: '#4ade80' },
  },
  {
    id: 'obsidian',
    name: 'OBSIDIAN',
    desc: 'Unlocked after 10 runs.',
    req: { type: 'stat', key: 'games', value: 10 },
    colors: { primary: '#8b5cf6', secondary: '#64748b', core: '#e2e8f0', glow: '#8b5cf6' },
  },
  {
    id: 'aurora',
    name: 'AURORA',
    desc: 'Unlocked by surviving 180 seconds.',
    req: { type: 'achievement', id: 'endurance' },
    colors: { primary: '#2dd4bf', secondary: '#c084fc', core: '#f0fdfa', glow: '#2dd4bf' },
  },
];

export class Skins {
  constructor(storage, achievements) {
    this.storage = storage;
    this.achievements = achievements;
  }

  get all() {
    return SKINS;
  }

  isUnlocked(id) {
    return this.storage.skins.unlocked.includes(id);
  }

  get selectedId() {
    const id = this.storage.skins.selected;
    return this.isUnlocked(id) ? id : 'void';
  }

  get selected() {
    return SKINS.find((s) => s.id === this.selectedId) || SKINS[0];
  }

  requirementMet(skin) {
    if (!skin.req) return true;
    if (skin.req.type === 'achievement') return this.achievements.isUnlocked(skin.req.id);
    if (skin.req.type === 'stat') return (this.storage.stats[skin.req.key] || 0) >= skin.req.value;
    return false;
  }

  /** Persist any newly earned skins. Returns newly unlocked skin definitions. */
  evaluate() {
    const unlocked = [];
    for (const skin of SKINS) {
      if (this.isUnlocked(skin.id)) continue;
      if (this.requirementMet(skin)) {
        if (this.storage.unlockSkin(skin.id)) unlocked.push(skin);
      }
    }
    if (!this.isUnlocked(this.storage.skins.selected)) {
      this.storage.setSkin('void');
    }
    return unlocked;
  }

  select(id) {
    if (!this.isUnlocked(id)) return false;
    this.storage.setSkin(id);
    return true;
  }
}
