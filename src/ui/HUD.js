/** DOM HUD. Only writes to the DOM when values actually change. */
import { formatNumber, formatTime } from '../game/Collision.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'),
      score: $('hud-score'),
      best: $('hud-best'),
      time: $('hud-time'),
      mode: $('hud-mode'),
      event: $('hud-event'),
      runId: $('hud-run-id'),
      echoFill: $('hud-echo-fill'),
      echoCount: $('hud-echo-count'),
      combo: $('hud-combo'),
      mult: $('hud-mult'),
      comboCount: $('hud-combo-count'),
      comboFill: $('hud-combo-fill'),
      healthFill: $('hud-health-fill'),
      healthText: $('hud-health-text'),
      shield: $('hud-shield'),
      dashFill: $('hud-dash-fill'),
      dashLabel: $('hud-dash-label'),
      dashMeter: $('hud-dash-meter'),
      pulseFill: $('hud-pulse-fill'),
      pulseLabel: $('hud-pulse-label'),
      pulseMeter: $('hud-pulse-meter'),
      powerups: $('hud-powerups'),
      touchDash: $('btn-dash'),
      touchAbility: $('btn-ability'),
    };
    this.last = {};
    this.powerSignature = '';
    this.shieldSignature = '';
  }

  setVisible(visible) {
    this.el.root.classList.toggle('is-hidden', !visible);
  }

  reset(game) {
    this.last = {};
    this.powerSignature = '';
    this.shieldSignature = '';
    this.el.powerups.innerHTML = '';
    this.el.combo.classList.remove('is-active', 'is-hot');
    if (game) this.update(game);
  }

  _text(key, el, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
  }

  _width(key, el, value) {
    const v = `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
    if (this.last[key] === v) return;
    this.last[key] = v;
    el.style.width = v;
  }

  update(game) {
    const player = game.player;
    this._text('score', this.el.score, formatNumber(game.score));
    this._text('best', this.el.best, formatNumber(game.bestScore));
    this._text('time', this.el.time, formatTime(game.runTime));
    this._text('mode', this.el.mode, game.modeLabel);
    this._text('run', this.el.runId, game.runId);

    const interval = game.echoInterval;
    const echoProgress = interval > 0 ? (1 - game.echoTimer / interval) * 100 : 0;
    this._width('echo', this.el.echoFill, echoProgress);
    const echoCount = game.echoes.length;
    this._text('echoCount', this.el.echoCount, `${echoCount} ECHO${echoCount === 1 ? '' : 'ES'}`);

    const mult = game.multiplier;
    this._text('mult', this.el.mult, `x${mult}`);
    this._text('comboCount', this.el.comboCount, `CHAIN ${game.combo}`);
    this._width('combo', this.el.comboFill, (game.comboTimer / game.comboWindow) * 100);
    this.el.combo.classList.toggle('is-active', game.combo > 0);
    this.el.combo.classList.toggle('is-hot', mult >= 5);

    const healthPct = (player.health / player.maxHealth) * 100;
    this._width('health', this.el.healthFill, healthPct);
    this._text('healthText', this.el.healthText, String(Math.ceil(player.health)));
    this.el.healthFill.classList.toggle('is-low', healthPct <= 30);

    const shields = `${player.shieldHits}`;
    if (shields !== this.shieldSignature) {
      this.shieldSignature = shields;
      this.el.shield.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const pip = document.createElement('span');
        pip.className = `shield-pip${i < player.shieldHits ? ' is-on' : ''}`;
        this.el.shield.appendChild(pip);
      }
    }

    const dashPct = player.dashCooldown <= 0 ? 100 : (1 - player.dashCooldown / player.dashCdMax) * 100;
    this._width('dash', this.el.dashFill, dashPct);
    this._text('dashLabel', this.el.dashLabel, player.dashCooldown <= 0 ? 'READY' : `${player.dashCooldown.toFixed(1)}s`);
    this.el.dashMeter.classList.toggle('is-ready', player.dashCooldown <= 0);

    this._width('pulse', this.el.pulseFill, player.pulseCharge);
    this._text('pulseLabel', this.el.pulseLabel, player.pulseCharge >= 100 ? 'READY' : `${Math.floor(player.pulseCharge)}%`);
    this.el.pulseMeter.classList.toggle('is-ready', player.pulseCharge >= 100);

    // Event status
    let eventText = 'STABLE';
    let eventClass = '';
    if (game.eventState === 'warning' && game.pendingEvent) {
      eventText = 'INCOMING';
      eventClass = 'is-warn';
    } else if (game.eventState === 'active' && game.activeEvent) {
      eventText = game.activeEvent.name;
      eventClass = game.activeEvent.id === 'blackout' ? 'is-danger' : '';
    }
    this._text('event', this.el.event, eventText);
    if (this.last.eventClass !== eventClass) {
      this.last.eventClass = eventClass;
      this.el.event.classList.remove('is-danger', 'is-warn');
      if (eventClass) this.el.event.classList.add(eventClass);
    }

    this._updatePowerups(game);
    this._updateTouch(game, player);
  }

  _updatePowerups(game) {
    const chips = [];
    const p = game.player;
    if (p.overclock > 0) chips.push(['OVERCLOCK', Math.ceil(p.overclock), '#fbbf24']);
    if (p.magnet > 0) chips.push(['MAGNET', Math.ceil(p.magnet), '#c4b5fd']);
    if (p.multBoost > 0) chips.push(['AMP', Math.ceil(p.multBoost), '#f472b6']);
    if (game.difficulty.slowTimer > 0) chips.push(['FRACTURE', Math.ceil(game.difficulty.slowTimer), '#818cf8']);
    if (p.shieldHits > 0) chips.push([`SHIELD x${p.shieldHits}`, 0, '#22d3ee']);

    const signature = chips.map((c) => `${c[0]}${c[1]}`).join('|');
    if (signature === this.powerSignature) return;
    this.powerSignature = signature;
    this.el.powerups.innerHTML = '';
    for (const [name, seconds, color] of chips) {
      const chip = document.createElement('span');
      chip.className = 'power-chip';
      chip.style.setProperty('--chip', color);
      const dot = document.createElement('i');
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(seconds > 0 ? `${name} ${seconds}s` : name));
      this.el.powerups.appendChild(chip);
    }
  }

  _updateTouch(game, player) {
    const dash = this.el.touchDash;
    const ability = this.el.touchAbility;
    if (!dash || !ability) return;
    const dashFill = dash.querySelector('.touch-fill');
    const abilityFill = ability.querySelector('.touch-fill');
    if (dashFill) dashFill.style.height = `${player.dashCooldown <= 0 ? 0 : (player.dashCooldown / player.dashCdMax) * 100}%`;
    if (abilityFill) abilityFill.style.height = `${player.pulseCharge}%`;
    dash.classList.toggle('is-ready', player.dashCooldown <= 0);
    dash.classList.toggle('is-cooling', player.dashCooldown > 0);
    ability.classList.toggle('is-ready', player.pulseCharge >= 100);
  }
}
