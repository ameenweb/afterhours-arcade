/**
 * Timestamped movement recorder.
 * Samples at a fixed 30 Hz using simulation time, never frame counts. The
 * buffer is pruned to just over eight seconds so memory stays bounded.
 */

const RECORD_HZ = 30;
const RECORD_INTERVAL = 1 / RECORD_HZ;
const ECHO_SECONDS = 8;

export class EchoRecorder {
  constructor() {
    this.samples = [];
    this.acc = 0;
  }

  reset(player, gameTime = 0) {
    this.samples = [this._sample(player, gameTime)];
    this.acc = 0;
  }

  _sample(player, gameTime) {
    return {
      t: gameTime,
      x: player.x,
      y: player.y,
      angle: player.facing,
      dashing: player.dashTimer > 0,
    };
  }

  update(dt, player, gameTime) {
    this.acc += dt;
    let guard = 0;
    while (this.acc >= RECORD_INTERVAL && guard < 4) {
      this.acc -= RECORD_INTERVAL;
      this.samples.push(this._sample(player, gameTime));
      guard += 1;
    }
    // Hard cap in case a tab resumes after a long stall.
    if (this.samples.length > 400) {
      this.samples.splice(0, this.samples.length - 400);
    }
  }

  prune(gameTime) {
    const cutoff = gameTime - ECHO_SECONDS - 1.5;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
  }

  /** Snapshot of the last N seconds, ending exactly at the current time. */
  history(player, gameTime, seconds = ECHO_SECONDS) {
    this.update(0, player, gameTime);
    const cutoff = gameTime - seconds;
    let result = this.samples.filter((s) => s.t >= cutoff);
    if (result.length < 2) result = this.samples.slice(-2);
    const last = result[result.length - 1];
    if (!last || last.t < gameTime - 0.05) {
      result.push(this._sample(player, gameTime));
    }
    return result;
  }
}
