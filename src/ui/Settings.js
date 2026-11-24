/** Settings panel: audio, visuals, accessibility, controls and reset. */
import { keyLabel } from '../game/InputManager.js';

const $ = (id) => document.getElementById(id);

export class Settings {
  constructor({ storage, audio, input, applySettings, notify, onReset }) {
    this.storage = storage;
    this.audio = audio;
    this.input = input;
    this.applySettings = applySettings;
    this.notify = notify;
    this.onReset = onReset;
    this.listening = null;
    this._outsideHandler = null;

    this.el = {
      sound: $('set-sound'),
      soundValue: $('set-sound-value'),
      music: $('set-music'),
      musicValue: $('set-music-value'),
      effects: Array.from(document.querySelectorAll('[data-action="effects"]')),
      reduced: $('set-reduced'),
      shake: $('set-shake'),
      lefty: $('set-lefty'),
      keyDash: $('key-dash'),
      keyAbility: $('key-ability'),
    };

    this.el.sound.addEventListener('input', () => this._onVolume('sound'));
    this.el.music.addEventListener('input', () => this._onVolume('music'));
    this.el.sound.addEventListener('change', () => this.storage.save());
    this.el.music.addEventListener('change', () => this.storage.save());

    this.sync();
  }

  _onVolume(which) {
    const value = Number(this.el[which].value) / 100;
    this.storage.data.settings[which] = value;
    this.el[`${which}Value`].textContent = `${Math.round(value * 100)}%`;
    this.audio.setVolumes(this.storage.settings.sound, this.storage.settings.music);
  }

  sync() {
    const s = this.storage.settings;
    this.el.sound.value = String(Math.round(s.sound * 100));
    this.el.music.value = String(Math.round(s.music * 100));
    this.el.soundValue.textContent = `${Math.round(s.sound * 100)}%`;
    this.el.musicValue.textContent = `${Math.round(s.music * 100)}%`;
    for (const btn of this.el.effects) {
      btn.classList.toggle('is-active', btn.dataset.value === s.effects);
      btn.setAttribute('aria-pressed', String(btn.dataset.value === s.effects));
    }
    this.el.reduced.setAttribute('aria-checked', String(Boolean(s.reducedMotion)));
    this.el.shake.setAttribute('aria-checked', String(Boolean(s.screenShake)));
    this.el.lefty.setAttribute('aria-checked', String(Boolean(s.leftHanded)));
    this.el.keyDash.textContent = keyLabel(s.keys.dash);
    this.el.keyAbility.textContent = keyLabel(s.keys.ability);
    if (this.applySettings) this.applySettings(s);
  }

  toggle(key) {
    const s = this.storage.settings;
    const next = !s[key];
    this.storage.updateSettings({ [key]: next });
    this.sync();
    this.audio.ui();
    if (key === 'reducedMotion') {
      this.notify('ACCESSIBILITY', next ? 'Reduced motion enabled' : 'Reduced motion disabled', '', 'cyan');
    }
    if (key === 'leftHanded') {
      this.notify('CONTROLS', next ? 'Touch controls mirrored' : 'Touch controls restored', '', 'cyan');
    }
  }

  setEffects(value) {
    this.storage.updateSettings({ effects: value });
    this.sync();
    this.audio.ui();
  }

  beginKeybind(which, button) {
    if (this.listening) this.cancelKeybind();
    this.listening = { which, button };
    button.textContent = 'PRESS A KEY';
    button.classList.add('is-listening');
    this.audio.ui();

    this.input.captureNextKey((code) => {
      this._finishListening();
      if (code === 'Escape') {
        this.sync();
        return;
      }
      const keys = { ...this.storage.settings.keys, [which]: code };
      this.storage.updateSettings({ keys });
      this.sync();
      this.audio.ui();
      this.notify('CONTROL BOUND', `${which === 'dash' ? 'Dash' : 'Pulse'} → ${keyLabel(code)}`, '', 'cyan');
    });

    setTimeout(() => {
      this._outsideHandler = (e) => {
        if (!button.contains(e.target)) this.cancelKeybind();
      };
      document.addEventListener('pointerdown', this._outsideHandler, { once: true });
    }, 0);
  }

  _finishListening() {
    if (!this.listening) return;
    this.listening.button.classList.remove('is-listening');
    this.listening = null;
    if (this._outsideHandler) {
      document.removeEventListener('pointerdown', this._outsideHandler);
      this._outsideHandler = null;
    }
  }

  cancelKeybind() {
    if (!this.listening) return;
    this.input.cancelCapture();
    this._finishListening();
    this.sync();
  }

  resetProgress() {
    const ok = window.confirm('Erase ALL AFTERHOURS progress, achievements, skins and settings? This cannot be undone.');
    if (!ok) return;
    this.storage.reset();
    this.sync();
    this.audio.ui();
    if (this.onReset) this.onReset();
    this.notify('MEMORY WIPED', 'All local progress has been erased.', '', 'red', 4200);
  }
}
