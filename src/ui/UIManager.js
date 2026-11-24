/**
 * Screen orchestration: menus, overlays, HUD visibility, banners, countdowns,
 * toasts and the global action wiring.
 */
import { HUD } from './HUD.js';
import { GameOver } from './GameOver.js';
import { Settings } from './Settings.js';
import { Menu } from './Menu.js';
import { getDailyChallenge } from '../systems/DailyChallenge.js';
import { formatNumber, formatTime } from '../game/Collision.js';

const $ = (id) => document.getElementById(id);

export class UIManager {
  constructor({ storage, audio, achievements, skins, input }) {
    this.storage = storage;
    this.audio = audio;
    this.achievements = achievements;
    this.skins = skins;
    this.input = input;
    this.game = null;
    this.current = 'menu';
    this.daily = getDailyChallenge();
    this.rotateTimer = null;
    this.rotateShown = false;

    this.screens = new Map();
    for (const el of document.querySelectorAll('.screen')) {
      this.screens.set(el.id.replace('screen-', ''), el);
    }

    this.hud = new HUD();
    this.gameOver = new GameOver();

    this.menu = new Menu({
      storage,
      achievements,
      skins,
      audio,
      notify: (kicker, title, desc, type, duration) => this.toast(kicker, title, desc, type, duration),
    });

    this.settings = new Settings({
      storage,
      audio,
      input,
      applySettings: (s) => this.applySettings(s),
      notify: (kicker, title, desc, type, duration) => this.toast(kicker, title, desc, type, duration),
      onReset: () => {
        this.menu.refreshMenu(this.daily);
        this.menu.renderStats(this.daily);
        this.menu.renderSkins();
      },
    });

    this._bindActions();
    this._bindFirstGesture();
    this.applySettings(this.storage.settings);
    this.menu.refreshMenu(this.daily);
    this._showScreen('menu');

    window.addEventListener('resize', () => this.updateOrientation());
    window.addEventListener('orientationchange', () => this.updateOrientation());
  }

  attach(game) {
    this.game = game;
    this.menu.refreshMenu(this.daily);
    this.applySettings(this.storage.settings);
  }

  // ---------------------------- SCREEN STATE ---------------------------
  _showScreen(name) {
    for (const [key, el] of this.screens) {
      el.classList.toggle('is-active', key === name);
      if (key === name) el.scrollTop = 0;
    }
    this.current = name;
  }

  hideScreens() {
    for (const el of this.screens.values()) el.classList.remove('is-active');
    this.current = 'none';
  }

  showMenu() {
    this._refreshDaily();
    this._showScreen('menu');
    this.hud.setVisible(false);
    this.setTouchControls(false);
    this.hideBanner();
    this.hideCountdown();
    this.clearToasts();
    this.gameOver.hide();
    this.settings.cancelKeybind();
    document.body.classList.remove('is-playing');
    this.hideRotateHint();
    if (this.audio.ready) this.audio.startMusic(0.3);
    this.menu.refreshMenu(this.daily);
  }

  startGame(mode) {
    if (!this.game) return;
    this.audio.unlock();
    this.audio.ui();
    this._refreshDaily();
    this.hideScreens();
    this.hud.setVisible(true);
    this.hud.reset(this.game);
    this.setTouchControls(true);
    this.gameOver.hide();
    this.hideBanner();
    this.hideCountdown();
    this.clearToasts();
    this.settings.cancelKeybind();
    document.body.classList.add('is-playing');
    this.rotateShown = false;
    this.updateOrientation();
    this.game.start(mode, { challenge: this.daily });
  }

  resumeGameplay() {
    this.hideScreens();
    this.hud.setVisible(true);
    this.setTouchControls(true);
    this.hideBanner();
    document.body.classList.add('is-playing');
    this.updateOrientation();
  }

  showPause() {
    if (!this.game) return;
    $('pause-score').textContent = formatNumber(this.game.score);
    $('pause-time').textContent = formatTime(this.game.runTime);
    $('pause-echoes').textContent = String(this.game.echoesSpawned);
    this._showScreen('pause');
    this.hud.setVisible(true);
    this.setTouchControls(false);
    this.hideBanner();
    this.hideCountdown();
    this.clearToasts();
  }

  showGameOver(data) {
    this.hud.setVisible(false);
    this.setTouchControls(false);
    this.hideBanner();
    this.hideCountdown();
    document.body.classList.remove('is-playing');
    this.hideRotateHint();
    this._showScreen('gameover');
    this.gameOver.show(data);
  }

  openSettings(returnTo = 'menu') {
    this.settings.sync();
    const back = this.screens.get('settings')?.querySelector('[data-action="back"]');
    if (back) back.dataset.back = returnTo;
    this._showScreen('settings');
    this.hud.setVisible(false);
    this.setTouchControls(false);
  }

  // ------------------------------ ACTIONS ------------------------------
  _bindActions() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const action = el.dataset.action;

      switch (action) {
        case 'play': {
          const mode = el.dataset.mode || 'classic';
          this.startGame(mode);
          break;
        }
        case 'howto':
          this.audio.unlock();
          this.audio.ui();
          this._showScreen('howto');
          this.hud.setVisible(false);
          this.setTouchControls(false);
          break;
        case 'stats':
          this.audio.unlock();
          this.audio.ui();
          this._refreshDaily();
          this.menu.renderStats(this.daily);
          this._showScreen('stats');
          this.hud.setVisible(false);
          this.setTouchControls(false);
          break;
        case 'skins':
          this.audio.unlock();
          this.audio.ui();
          this.menu.renderSkins();
          this._showScreen('skins');
          this.hud.setVisible(false);
          this.setTouchControls(false);
          break;
        case 'settings':
          this.audio.unlock();
          this.audio.ui();
          this.openSettings(this.game?.state === 'paused' ? 'pause' : 'menu');
          break;
        case 'back': {
          this.audio.ui();
          const target = el.dataset.back || 'menu';
          if (target === 'pause' && this.game?.state === 'paused') {
            this._showScreen('pause');
            this.hud.setVisible(true);
            this.setTouchControls(false);
          } else if (this.game && this.game.state !== 'menu') {
            this.game.quitToMenu();
          } else {
            this.showMenu();
          }
          break;
        }
        case 'pause':
          this.audio.ui();
          this.game?.pause();
          break;
        case 'resume':
          this.audio.ui();
          this.game?.resume();
          break;
        case 'restart':
          this.audio.ui();
          this.game?.restart();
          break;
        case 'quit':
          this.audio.ui();
          this.game?.quitToMenu();
          break;
        case 'retry':
          this.audio.ui();
          this.game?.retry();
          break;
        case 'toggle':
          this.settings.toggle(el.dataset.key);
          break;
        case 'effects':
          this.settings.setEffects(el.dataset.value);
          break;
        case 'keybind':
          this.settings.beginKeybind(el.dataset.key, el);
          break;
        case 'reset-progress':
          this.settings.resetProgress();
          break;
        case 'skin':
          this.menu.selectSkin(el.dataset.skin);
          break;
        default:
          break;
      }
    });

    document.addEventListener('contextmenu', (e) => {
      if (this.game?.state === 'playing') e.preventDefault();
    });
  }

  _bindFirstGesture() {
    const unlock = () => {
      const wasReady = this.audio.ready;
      this.audio.unlock();
      if (!wasReady && this.game?.state === 'menu') {
        this.audio.startMusic(0.3);
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  // ------------------------------ HUD ----------------------------------
  updateHUD(game) {
    if (this.hud.el.root.classList.contains('is-hidden')) return;
    this.hud.update(game);
  }

  setTouchControls(visible) {
    const show = visible && this.input.isTouch;
    $('mobile-controls').classList.toggle('is-hidden', !show);
  }

  // ---------------------------- OVERLAYS -------------------------------
  countdown(value, sub = 'SYNCING NEURAL LINK') {
    const el = $('countdown');
    if (value === null) {
      el.classList.add('is-hidden');
      return;
    }
    el.classList.remove('is-hidden');
    $('countdown-value').textContent = String(value);
    const small = el.querySelector('small');
    if (small) small.textContent = sub;
    const span = $('countdown-value');
    span.style.animation = 'none';
    void span.offsetWidth;
    span.style.animation = '';
  }

  hideCountdown() {
    $('countdown').classList.add('is-hidden');
  }

  showBanner({ kicker = 'INCOMING EVENT', title, sub, active = false, progress = 1 }) {
    const el = $('banner');
    el.classList.remove('is-hidden');
    el.classList.toggle('is-active', active);
    $('banner-kicker').textContent = kicker;
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    this.updateBanner(progress);
  }

  updateBanner(progress) {
    $('banner-fill').style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  }

  hideBanner() {
    $('banner').classList.add('is-hidden');
  }

  clearToasts() {
    $('toasts').replaceChildren();
  }

  toast(kicker, title, desc = '', type = 'purple', duration = 3400) {
    const wrap = $('toasts');
    while (wrap.children.length >= 4) wrap.removeChild(wrap.firstElementChild);

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    const k = document.createElement('span');
    k.className = 'toast-kicker';
    k.textContent = kicker;
    const t = document.createElement('span');
    t.className = 'toast-title';
    t.textContent = title;
    el.append(k, t);
    if (desc) {
      const d = document.createElement('span');
      d.className = 'toast-desc';
      d.textContent = desc;
      el.appendChild(d);
    }
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  flash(color = '#ffffff', opacity = 0.35) {
    const el = $('fx-flash');
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(opacity);
    void el.offsetWidth;
    el.style.transition = 'opacity 0.4s ease-out';
    el.style.opacity = '0';
  }

  // ---------------------------- SETTINGS -------------------------------
  applySettings(s) {
    document.body.classList.toggle('reduced-motion', Boolean(s.reducedMotion));
    document.body.classList.toggle('low-effects', s.effects === 'low');
    document.body.classList.toggle('lefty', Boolean(s.leftHanded));
    this.audio.setVolumes(s.sound, s.music);
    this.input.setSettings(s);
    if (this.game) {
      this.game.effectsQuality = s.reducedMotion || s.effects === 'low' ? 0.35 : 1;
      this.game.particles.quality = this.game.effectsQuality;
      this.game.reducedMotion = Boolean(s.reducedMotion);
      this.game.screenShake = Boolean(s.screenShake) && !s.reducedMotion;
    }
  }

  _refreshDaily() {
    const next = getDailyChallenge();
    if (next.date !== this.daily.date) {
      this.daily = next;
      this.menu.refreshMenu(this.daily);
    }
  }

  // --------------------------- ORIENTATION -----------------------------
  updateOrientation() {
    const portrait = window.innerHeight > window.innerWidth;
    const small = window.innerWidth < 900;
    const should = document.body.classList.contains('is-playing') && this.input.isTouch && portrait && small;
    if (!should) {
      this.hideRotateHint();
      return;
    }
    if (this.rotateShown || this.rotateTimer) return;
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      if (!document.body.classList.contains('is-playing')) return;
      $('rotate-hint').classList.remove('is-hidden');
      this.rotateShown = true;
      setTimeout(() => this.hideRotateHint(), 5500);
    }, 1400);
  }

  hideRotateHint() {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
    $('rotate-hint').classList.add('is-hidden');
  }
}
