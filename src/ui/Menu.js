/** Menu, statistics, achievements, daily log and skin selection rendering. */
import { formatNumber, formatTime } from '../game/Collision.js';
import { formatDailyDate } from '../systems/DailyChallenge.js';
import { SKINS } from '../systems/Skins.js';

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor({ storage, achievements, skins, audio, notify }) {
    this.storage = storage;
    this.achievements = achievements;
    this.skins = skins;
    this.audio = audio;
    this.notify = notify;
  }

  refreshMenu(challenge) {
    const stats = this.storage.stats;
    $('menu-best').textContent = formatNumber(stats.bestScore);
    $('menu-runs').textContent = formatNumber(stats.games);
    $('menu-total-time').textContent = formatTime(stats.totalTime);
    $('menu-skin-name').textContent = this.skins.selected.name;
    $('menu-daily-date').textContent = `${formatDailyDate(new Date())} · ${challenge.name}`;

    const today = this.storage.daily.history[challenge.date];
    $('menu-daily-best').textContent = today ? `BEST ${formatNumber(today.score)}` : 'NO RUN';
    const state = $('daily-state');
    if (today?.completed) {
      state.textContent = 'CLEARED';
      state.classList.remove('pill--dim');
    } else if (today?.attempts) {
      state.textContent = 'IN PROGRESS';
      state.classList.remove('pill--dim');
    } else {
      state.textContent = 'OPEN';
      state.classList.add('pill--dim');
    }
  }

  renderStats(challenge) {
    const stats = this.storage.stats;
    const grid = $('stats-grid');
    grid.innerHTML = '';

    const cards = [
      ['PERSONAL BEST', formatNumber(stats.bestScore), true],
      ['BEST SURVIVAL', formatTime(stats.bestTime), false],
      ['RUNS PLAYED', formatNumber(stats.games), false],
      ['TOTAL SURVIVAL', formatTime(stats.totalTime), false],
      ['ORBS COLLECTED', formatNumber(stats.totalOrbs), false],
      ['ECHOES SUMMONED', formatNumber(stats.totalEchoes), false],
      ['HOSTILES ERASED', formatNumber(stats.totalKills), false],
      ['BEST CHAIN', `x${stats.maxCombo}`, true],
      ['DAILIES CLEARED', formatNumber(stats.totalDaily), false],
      ['DAILY STREAK', `${stats.dailyStreak} DAY${stats.dailyStreak === 1 ? '' : 'S'}`, false],
      ['DAILY BEST', formatNumber(stats.bestDailyScore), false],
      ['BEST CLASSIC', formatNumber(stats.bestClassicScore), false],
    ];

    for (const [label, value, accent] of cards) {
      const card = document.createElement('div');
      card.className = `stat-card${accent ? ' stat-card--accent' : ''}`;
      const span = document.createElement('span');
      span.textContent = label;
      const b = document.createElement('b');
      b.textContent = value;
      card.append(span, b);
      grid.appendChild(card);
    }

    const list = $('achievements-list');
    list.innerHTML = '';
    const unlockedCount = this.achievements.getUnlockedCount();
    $('achievement-count').textContent = `${unlockedCount}/${this.achievements.definitions.length}`;

    for (const def of this.achievements.definitions) {
      const unlocked = this.achievements.isUnlocked(def.id);
      const item = document.createElement('div');
      item.className = `achievement${unlocked ? ' is-unlocked' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'achievement-icon';
      icon.textContent = def.icon;
      const body = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = def.name;
      const desc = document.createElement('span');
      desc.textContent = def.desc;
      body.append(name, desc);
      const state = document.createElement('span');
      state.className = 'ach-state';
      state.textContent = unlocked ? 'UNLOCKED' : 'LOCKED';
      item.append(icon, body, state);
      list.appendChild(item);
    }

    this._renderDailyHistory(challenge);
  }

  _renderDailyHistory(challenge) {
    const history = this.storage.daily.history;
    const wrap = $('daily-history');
    wrap.innerHTML = '';
    const base = new Date(`${challenge.date}T00:00:00Z`);

    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const entry = history[key];
      const row = document.createElement('div');
      row.className = 'daily-entry';

      const date = document.createElement('span');
      date.textContent = key;

      const score = document.createElement('b');
      score.textContent = entry ? formatNumber(entry.score) : '—';

      const state = document.createElement('span');
      if (entry?.completed) {
        state.textContent = 'CLEARED';
        state.className = 'ok';
      } else if (entry) {
        state.textContent = 'ATTEMPT';
        state.className = 'miss';
      } else {
        state.textContent = i === 0 ? 'OPEN' : '—';
        state.className = 'miss';
      }

      row.append(date, score, state);
      wrap.appendChild(row);
    }

    $('stats-daily-streak').textContent = `STREAK ${this.storage.stats.dailyStreak} DAY${this.storage.stats.dailyStreak === 1 ? '' : 'S'}`;
  }

  renderSkins() {
    const grid = $('skins-grid');
    grid.innerHTML = '';
    $('skin-current').textContent = this.skins.selected.name;

    for (const skin of SKINS) {
      const unlocked = this.skins.isUnlocked(skin.id);
      const selected = this.skins.selectedId === skin.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `skin-card${selected ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`;
      card.dataset.action = 'skin';
      card.dataset.skin = skin.id;
      card.setAttribute('aria-label', `${skin.name}${unlocked ? '' : ' (locked)'}`);

      const swatch = document.createElement('span');
      swatch.className = 'skin-swatch';
      swatch.style.setProperty('--swatch-primary', skin.colors.primary);
      swatch.style.setProperty('--swatch-secondary', skin.colors.secondary);
      swatch.style.setProperty('--swatch-glow', `${skin.colors.primary}55`);
      const orb = document.createElement('span');
      orb.className = 'skin-orb';
      swatch.appendChild(orb);

      const name = document.createElement('span');
      name.className = 'skin-name';
      name.textContent = skin.name;

      const req = document.createElement('span');
      req.className = 'skin-req';
      req.textContent = unlocked ? skin.desc : `LOCKED · ${skin.desc}`;

      const state = document.createElement('span');
      state.className = 'skin-state';
      state.textContent = selected ? 'EQUIPPED' : unlocked ? 'SELECT' : 'LOCKED';

      card.append(swatch, name, req, state);
      grid.appendChild(card);
    }
  }

  selectSkin(id) {
    const skin = SKINS.find((s) => s.id === id);
    if (!skin) return;
    if (!this.skins.isUnlocked(id)) {
      this.audio.denied();
      this.notify('OPERATIVE LOCKED', skin.desc, '', 'red');
      return;
    }
    this.skins.select(id);
    this.audio.ui();
    this.renderSkins();
    $('menu-skin-name').textContent = this.skins.selected.name;
    this.notify('OPERATIVE EQUIPPED', skin.name, skin.desc, 'cyan');
  }
}
