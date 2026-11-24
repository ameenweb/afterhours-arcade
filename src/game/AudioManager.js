/**
 * Original synthesized audio. No samples, no external assets.
 * SFX and a procedural synthwave score are generated with the Web Audio API.
 */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class AudioManager {
  constructor(storage) {
    this.storage = storage;
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.sfx = null;
    this.music = null;
    this.noiseBuffer = null;
    this.soundVolume = storage.settings.sound;
    this.musicVolume = storage.settings.music;
    this.musicWanted = false;
    this.musicPlaying = false;
    this.paused = false;
    this.intensity = 0.4;
    this.nextStepTime = 0;
    this.step = 0;
    this.lastPlayed = new Map();
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      try {
        this.ctx = new Ctx();
      } catch {
        return false;
      }
      this._buildGraph();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.ready = true;
    return true;
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.25;

    this.master.connect(compressor);
    compressor.connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this._soundTarget();
    this.sfx.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.0001;
    this.music.connect(this.master);

    // A simple feedback delay gives the score some depth.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.24;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.music.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(this.master);
    this.delayNode = delay;

    // Shared noise buffer for hats, impacts and sweeps.
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  _soundTarget() {
    return Math.pow(clamp(this.soundVolume, 0, 1), 1.25) * 0.9;
  }

  _musicTarget() {
    const base = Math.pow(clamp(this.musicVolume, 0, 1), 1.4) * 0.5;
    return this.paused ? base * 0.22 : base;
  }

  setVolumes(sound, music) {
    if (typeof sound === 'number') this.soundVolume = clamp(sound, 0, 1);
    if (typeof music === 'number') this.musicVolume = clamp(music, 0, 1);
    if (this.sfx && this.ctx) {
      this.sfx.gain.setTargetAtTime(this._soundTarget(), this.ctx.currentTime, 0.05);
    }
    if (this.music && this.ctx) {
      const target = this.musicPlaying ? this._musicTarget() : 0.0001;
      this.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    }
  }

  _tone({
    freq,
    endFreq = null,
    type = 'sine',
    dur = 0.15,
    gain = 0.1,
    attack = 0.005,
    when = 0,
    dest = null,
    filter = null,
    detune = 0,
  }) {
    if (!this.ctx || !this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    }
    const peak = Math.max(0.0004, gain);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.002, attack));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.02, dur));

    let node = osc;
    if (filter) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = filter.type || 'lowpass';
      biquad.frequency.setValueAtTime(filter.freq || 800, t0);
      if (filter.endFreq) biquad.frequency.exponentialRampToValueAtTime(Math.max(30, filter.endFreq), t0 + dur);
      biquad.Q.value = filter.q || 0.8;
      node.connect(biquad);
      node = biquad;
    }
    node.connect(env);
    env.connect(dest || this.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({
    dur = 0.2,
    gain = 0.08,
    when = 0,
    type = 'highpass',
    freq = 1000,
    endFreq = null,
    q = 0.8,
    dest = null,
  }) {
    if (!this.ctx || !this.ready || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0004, gain), t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(dest || this.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ----------------------------- SFX ------------------------------------
  ui() {
    this._tone({ freq: 440, endFreq: 620, type: 'triangle', dur: 0.07, gain: 0.045 });
  }

  orb(level = 1) {
    const n = Math.min(level, 16);
    const f = 520 + n * 26;
    this._tone({ freq: f, endFreq: f * 1.4, type: 'sine', dur: 0.11, gain: 0.075 });
    this._tone({ freq: f * 2, endFreq: f * 2.3, type: 'triangle', dur: 0.08, gain: 0.025, when: 0.01 });
  }

  bigOrb(level = 1) {
    const f = 420 + Math.min(level, 16) * 20;
    this._tone({ freq: f, endFreq: f * 1.8, type: 'sine', dur: 0.2, gain: 0.1 });
    this._tone({ freq: f * 1.5, type: 'triangle', dur: 0.24, gain: 0.05, when: 0.04 });
  }

  comboUp(level = 2) {
    const root = 420 + level * 34;
    [0, 0.055, 0.11].forEach((when, i) => {
      this._tone({ freq: root * (1 + i * 0.25), type: 'triangle', dur: 0.1, gain: 0.05, when });
    });
  }

  echoSpawn() {
    this._noise({ dur: 0.45, gain: 0.085, type: 'bandpass', freq: 1900, endFreq: 260, q: 1.4 });
    this._tone({ freq: 760, endFreq: 160, type: 'sawtooth', dur: 0.42, gain: 0.035, filter: { type: 'lowpass', freq: 1200, endFreq: 300 } });
    this._tone({ freq: 300, endFreq: 600, type: 'sine', dur: 0.3, gain: 0.04, when: 0.12 });
  }

  dash() {
    this._noise({ dur: 0.19, gain: 0.09, type: 'highpass', freq: 900, endFreq: 3200 });
    this._tone({ freq: 220, endFreq: 80, type: 'triangle', dur: 0.2, gain: 0.09 });
  }

  pulse() {
    this._tone({ freq: 140, endFreq: 36, type: 'sine', dur: 0.6, gain: 0.3 });
    this._noise({ dur: 0.5, gain: 0.12, type: 'lowpass', freq: 1400, endFreq: 120 });
    [0, 0.04, 0.08].forEach((when, i) => {
      this._tone({ freq: 330 * (i + 1), type: 'sawtooth', dur: 0.35, gain: 0.035, when, filter: { type: 'lowpass', freq: 900 } });
    });
  }

  hurt() {
    this._tone({ freq: 180, endFreq: 48, type: 'sawtooth', dur: 0.32, gain: 0.16, filter: { type: 'lowpass', freq: 900, endFreq: 200 } });
    this._noise({ dur: 0.22, gain: 0.1, type: 'lowpass', freq: 900 });
  }

  enemyKill() {
    this._tone({ freq: 400, endFreq: 70, type: 'square', dur: 0.13, gain: 0.055 });
    this._noise({ dur: 0.12, gain: 0.05, type: 'bandpass', freq: 1400, endFreq: 300 });
  }

  echoKill() {
    this._tone({ freq: 620, endFreq: 120, type: 'triangle', dur: 0.18, gain: 0.06 });
    this._noise({ dur: 0.18, gain: 0.05, type: 'bandpass', freq: 2400, endFreq: 500 });
  }

  enemyShot() {
    this._tone({ freq: 660, endFreq: 210, type: 'square', dur: 0.11, gain: 0.035 });
    this._noise({ dur: 0.07, gain: 0.025, type: 'highpass', freq: 2600 });
  }

  eventStart() {
    this._noise({ dur: 0.6, gain: 0.055, type: 'bandpass', freq: 320, endFreq: 2600, q: 1.1 });
    [196, 262, 330].forEach((freq, i) => {
      this._tone({ freq, type: 'sawtooth', dur: 0.42, gain: 0.04, when: i * 0.05, filter: { type: 'lowpass', freq: 1200 } });
    });
  }

  warning() {
    this._tone({ freq: 760, type: 'square', dur: 0.16, gain: 0.045 });
    this._tone({ freq: 760, type: 'square', dur: 0.16, gain: 0.045, when: 0.22 });
    this._tone({ freq: 570, type: 'square', dur: 0.24, gain: 0.04, when: 0.44 });
  }

  warningTick() {
    this._tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.03 });
  }

  denied() {
    this._tone({ freq: 150, endFreq: 110, type: 'square', dur: 0.13, gain: 0.05 });
  }

  relay() {
    [330, 415, 495, 660].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.45, gain: 0.04, when: i * 0.05 });
    });
  }

  shield() {
    this._tone({ freq: 520, endFreq: 1100, type: 'sine', dur: 0.3, gain: 0.07 });
    this._tone({ freq: 780, endFreq: 1400, type: 'triangle', dur: 0.35, gain: 0.035, when: 0.06 });
  }

  heal() {
    [440, 554, 659].forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 0.25, gain: 0.055, when: i * 0.08 });
    });
  }

  powerUp() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.05, when: i * 0.06 });
    });
  }

  achievement() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 0.32, gain: 0.055, when: i * 0.08 });
    });
  }

  gameOver() {
    [440, 349, 294, 220].forEach((f, i) => {
      this._tone({
        freq: f,
        endFreq: f * 0.94,
        type: 'sawtooth',
        dur: 0.55,
        gain: 0.055,
        when: i * 0.18,
        filter: { type: 'lowpass', freq: 1100, endFreq: 300 },
      });
    });
    this._noise({ dur: 1.2, gain: 0.045, type: 'lowpass', freq: 700, endFreq: 100 });
  }

  countdownTick(final = false) {
    if (final) {
      [523, 659, 784].forEach((f, i) => {
        this._tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.06, when: i * 0.04 });
      });
    } else {
      this._tone({ freq: 520, type: 'square', dur: 0.06, gain: 0.04 });
    }
  }

  dailyComplete() {
    [392, 523, 659, 784, 1047].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.45, gain: 0.055, when: i * 0.1 });
    });
  }

  // ----------------------------- MUSIC ----------------------------------
  startMusic(intensity = 0.4) {
    this.intensity = intensity;
    this.musicWanted = true;
    this.paused = false;
    if (!this.ctx || !this.ready) return;
    if (this.musicPlaying) {
      this.music.gain.setTargetAtTime(this._musicTarget(), this.ctx.currentTime, 0.2);
      return;
    }
    this.musicPlaying = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.08;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.music.gain.exponentialRampToValueAtTime(Math.max(0.0002, this._musicTarget()), this.ctx.currentTime + 0.8);
  }

  stopMusic() {
    this.musicWanted = false;
    if (!this.ctx || !this.music) return;
    this.musicPlaying = false;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
  }

  pauseMusic() {
    this.paused = true;
    if (!this.ctx || !this.music) return;
    this.music.gain.setTargetAtTime(this._musicTarget(), this.ctx.currentTime, 0.1);
  }

  resumeMusic() {
    this.paused = false;
    if (!this.ctx || !this.music) return;
    // Do not try to schedule the beats that elapsed while paused.
    this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.05);
    this.music.gain.setTargetAtTime(this._musicTarget(), this.ctx.currentTime, 0.15);
  }

  setIntensity(value) {
    this.intensity = clamp(value, 0, 1);
  }

  /** Called every frame; schedules music slightly ahead of the audio clock. */
  tick() {
    if (!this.ctx || !this.musicPlaying || this.paused) return;
    const ctx = this.ctx;
    const stepDur = 60 / 104 / 4;
    let guard = 0;
    while (this.nextStepTime < ctx.currentTime + 0.12 && guard < 8) {
      this._scheduleStep(this.step, this.nextStepTime - ctx.currentTime);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 64;
      guard += 1;
    }
  }

  _scheduleStep(step, when) {
    if (when < -0.1) return;
    const dest = this.music;
    const bassSeq = [45, 45, 48, 45, 52, 45, 43, 45, 45, 45, 48, 45, 50, 52, 43, 43];
    const arpSeq = [69, 72, 76, 72, 74, 76, 79, 76, 69, 72, 76, 72, 74, 79, 84, 79];
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 55, 59],
    ];

    if (step % 4 === 0) {
      this._tone({ freq: 140, endFreq: 42, type: 'sine', dur: 0.24, gain: 0.3, when, dest });
    }
    if (step % 4 === 2) {
      this._noise({ dur: 0.045, gain: 0.022, type: 'highpass', freq: 7200, when, dest });
    }
    if (step % 16 === 8) {
      this._noise({ dur: 0.14, gain: 0.045, type: 'bandpass', freq: 1800, q: 1.2, when, dest });
    }

    const bassNote = bassSeq[step % 16];
    if (step % 2 === 0) {
      this._tone({
        freq: midi(bassNote),
        type: 'sawtooth',
        dur: 0.17,
        gain: 0.065,
        when,
        dest,
        filter: { type: 'lowpass', freq: 420, endFreq: 180, q: 2 },
      });
    }

    if (this.intensity > 0.18 && step % 2 === 1) {
      const note = arpSeq[step % 16];
      this._tone({
        freq: midi(note),
        type: 'triangle',
        dur: 0.1,
        gain: 0.022,
        when,
        dest,
        filter: { type: 'highpass', freq: 500 },
      });
    }
    if (this.intensity > 0.62 && step % 4 === 3) {
      this._tone({ freq: midi(arpSeq[(step + 4) % 16] + 12), type: 'sine', dur: 0.14, gain: 0.016, when, dest });
    }

    if (step % 16 === 0) {
      const chord = chords[Math.floor(step / 16) % 4];
      for (const note of chord) {
        this._tone({
          freq: midi(note),
          type: 'sawtooth',
          dur: 2.35,
          gain: 0.018,
          attack: 0.35,
          when,
          dest,
          filter: { type: 'lowpass', freq: 900, endFreq: 500, q: 0.6 },
          detune: -7,
        });
        this._tone({
          freq: midi(note),
          type: 'sawtooth',
          dur: 2.35,
          gain: 0.014,
          attack: 0.45,
          when,
          dest,
          filter: { type: 'lowpass', freq: 760, endFreq: 420, q: 0.6 },
          detune: 7,
        });
      }
    }
  }
}
