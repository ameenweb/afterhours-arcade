/** Game-over presentation, including a short score count-up. */
import { formatNumber, formatTime } from '../game/Collision.js';

const $ = (id) => document.getElementById(id);

export class GameOver {
  constructor() {
    this.el = {
      score: $('go-score'),
      best: $('go-best'),
      time: $('go-time'),
      echoes: $('go-echoes'),
      orbs: $('go-orbs'),
      combo: $('go-combo'),
      kills: $('go-kills'),
      echoKills: $('go-echo-kills'),
      record: $('go-record'),
      kicker: $('go-kicker'),
      title: $('go-title'),
      daily: $('go-daily'),
      retrySub: $('go-retry-sub'),
      hint: $('go-hint'),
    };
    this.raf = 0;
  }

  show({ run, best, newBest, dailyResult, modeLabel, practice }) {
    cancelAnimationFrame(this.raf);
    this.el.kicker.textContent = practice ? 'TRAINING SESSION ENDED' : modeLabel;
    this.el.title.textContent = practice ? 'RUN ENDED' : 'SIGNAL LOST';
    this.el.record.classList.toggle('is-hidden', !newBest);
    this.el.best.textContent = formatNumber(best);
    this.el.time.textContent = formatTime(run.time);
    this.el.echoes.textContent = String(run.echoes);
    this.el.orbs.textContent = String(run.orbs);
    this.el.combo.textContent = `x${run.maxCombo}`;
    this.el.kills.textContent = String(run.kills);
    this.el.echoKills.textContent = String(run.echoKills);
    this.el.retrySub.textContent = modeLabel;
    this.el.hint.innerHTML = practice
      ? 'Practice runs are not recorded · <span class="key">ENTER</span> retry · <span class="key">ESC</span> menu'
      : '<span class="key">ENTER</span> to retry · <span class="key">ESC</span> for menu';

    if (dailyResult) {
      this.el.daily.classList.remove('is-hidden');
      const completed = dailyResult.completed;
      const streak = dailyResult.streak || 0;
      this.el.daily.textContent = completed
        ? `DAILY CLEARED · ${dailyResult.date} · STREAK ${streak} DAY${streak === 1 ? '' : 'S'}`
        : `DAILY INCOMPLETE · SURVIVE 60s TO CLEAR · BEST ${formatNumber(dailyResult.best)}`;
    } else {
      this.el.daily.classList.add('is-hidden');
    }

    const target = run.score;
    const reduced =
      document.body.classList.contains('reduced-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 800;
    if (!duration) {
      this.el.score.textContent = formatNumber(target);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.el.score.textContent = formatNumber(target * eased);
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.el.record.classList.add('is-hidden');
    this.el.daily.classList.add('is-hidden');
  }
}
