/**
 * Keyboard + touch input. Movement is always WASD / arrows; dash and pulse
 * can be rebound in settings. Touch uses a floating virtual stick and two
 * dedicated action buttons.
 */

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

const CODE_LABELS = {
  Space: 'SPACE',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT',
  AltRight: 'R-ALT',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  CapsLock: 'CAPS',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  KeyE: 'E',
  KeyQ: 'Q',
  KeyF: 'F',
  KeyR: 'R',
  KeyZ: 'Z',
  KeyX: 'X',
  KeyC: 'C',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM${code.slice(6)}`;
  return code.toUpperCase();
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export class InputManager {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.axis = { x: 0, y: 0 };
    this.joy = { x: 0, y: 0 };
    this.joyActive = false;
    this.joyPointer = null;
    this.dashPressed = false;
    this.abilityPressed = false;
    this.pausePressed = false;
    this.captureCallback = null;
    this.isTouch = false;
    this._joystickEl = null;
    this._knobEl = null;
    this._joyCenter = { x: 0, y: 0 };
    this._joyMax = 46;

    try {
      this.isTouch =
        window.matchMedia('(pointer: coarse)').matches ||
        (navigator.maxTouchPoints || 0) > 0;
    } catch {
      this.isTouch = 'ontouchstart' in window;
    }

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp, { passive: false });
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('touchstart', () => { this.isTouch = true; }, { once: true, passive: true });
  }

  setSettings(settings) {
    this.settings = settings;
  }

  _isGameplayKey(code) {
    if (MOVE_CODES.has(code)) return true;
    if (code === this.settings.keys.dash || code === this.settings.keys.ability) return true;
    if (code === 'Escape' || code === 'KeyP') return true;
    return false;
  }

  _onKeyDown(e) {
    if (isTypingTarget(e.target)) return;

    if (this.captureCallback) {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.captureCallback;
      this.captureCallback = null;
      cb(e.code);
      return;
    }

    if (this._isGameplayKey(e.code)) e.preventDefault();
    if (e.repeat) return;

    this.keys.add(e.code);

    if (e.code === this.settings.keys.dash) this.dashPressed = true;
    if (e.code === this.settings.keys.ability) this.abilityPressed = true;
    if (e.code === 'Escape' || e.code === 'KeyP') this.pausePressed = true;
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onBlur() {
    this.keys.clear();
    this._resetJoystick();
  }

  captureNextKey(cb) {
    this.captureCallback = cb;
  }

  cancelCapture() {
    this.captureCallback = null;
  }

  getAxis() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;

    if (this.joyActive) {
      x += this.joy.x;
      y += this.joy.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.axis.x = x;
    this.axis.y = y;
    return this.axis;
  }

  consumeDash() {
    const v = this.dashPressed;
    this.dashPressed = false;
    return v;
  }

  consumeAbility() {
    const v = this.abilityPressed;
    this.abilityPressed = false;
    return v;
  }

  consumePause() {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }

  clearEdges() {
    this.dashPressed = false;
    this.abilityPressed = false;
    this.pausePressed = false;
  }

  // ------------------------------ TOUCH --------------------------------
  bindTouchControls({ joystick, knob, dashButton, abilityButton }) {
    this._joystickEl = joystick;
    this._knobEl = knob;

    const updateJoystick = (clientX, clientY) => {
      const dx = clientX - this._joyCenter.x;
      const dy = clientY - this._joyCenter.y;
      const len = Math.hypot(dx, dy);
      const max = this._joyMax;
      const clamped = Math.min(len, max);
      const nx = len > 0 ? (dx / len) * (clamped / max) : 0;
      const ny = len > 0 ? (dy / len) * (clamped / max) : 0;
      this.joy.x = nx;
      this.joy.y = ny;
      this.joyActive = true;
      if (this._knobEl) {
        this._knobEl.style.transform = `translate(${nx * max}px, ${ny * max}px)`;
      }
    };

    joystick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyPointer !== null) return;
      this.joyPointer = e.pointerId;
      const rect = joystick.getBoundingClientRect();
      this._joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this._joyMax = rect.width * 0.33;
      joystick.setPointerCapture(e.pointerId);
      updateJoystick(e.clientX, e.clientY);
      joystick.classList.add('is-active');
    });

    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointer) return;
      e.preventDefault();
      updateJoystick(e.clientX, e.clientY);
    });

    const endJoy = (e) => {
      if (e.pointerId !== this.joyPointer) return;
      this._resetJoystick();
    };
    joystick.addEventListener('pointerup', endJoy);
    joystick.addEventListener('pointercancel', endJoy);
    joystick.addEventListener('lostpointercapture', () => this._resetJoystick());

    const bindButton = (el, kind) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-pressed');
        if (kind === 'dash') this.dashPressed = true;
        else this.abilityPressed = true;
      });
      const release = () => el.classList.remove('is-pressed');
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
      // Keyboard accessibility (Enter/Space generates a click with detail 0).
      el.addEventListener('click', (e) => {
        if (e.detail === 0) {
          if (kind === 'dash') this.dashPressed = true;
          else this.abilityPressed = true;
        }
      });
    };

    bindButton(dashButton, 'dash');
    bindButton(abilityButton, 'ability');
  }

  _resetJoystick() {
    this.joyPointer = null;
    this.joyActive = false;
    this.joy.x = 0;
    this.joy.y = 0;
    if (this._knobEl) this._knobEl.style.transform = 'translate(0px, 0px)';
    if (this._joystickEl) this._joystickEl.classList.remove('is-active');
  }

  reset() {
    this.keys.clear();
    this._resetJoystick();
    this.clearEdges();
  }
}
