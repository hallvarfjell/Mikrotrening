
// Presis nedtelling med absolutt sluttid, støtte for pause/resume.
export class CountdownTimer {
  constructor(onTick, onFinished) {
    this.onTick = onTick;
    this.onFinished = onFinished;
    this.target = null;      // ms epoch
    this._raf = null;
    this.remainingMs = 0;
    this.paused = false;
  }

  start(seconds) {
    const now = Date.now();
    this.target = now + seconds * 1000;
    this.paused = false;
    this._loop();
  }

  _loop = () => {
    if (this.paused || !this.target) return;
    const now = Date.now();
    this.remainingMs = Math.max(0, this.target - now);
    if (this.onTick) this.onTick(this.remainingMs);
    if (this.remainingMs <= 0) {
      this.stop();
      if (this.onFinished) this.onFinished();
      return;
    }
    // Oppdater ~4 ganger per sekund
    this._raf = setTimeout(this._loop, 250);
  }

  pause() {
    if (this.paused || !this.target) return;
    this.paused = true;
    if (this._raf) clearTimeout(this._raf);
    this._raf = null;
  }

  resume() {
    if (!this.paused || !this.target) return;
    this.paused = false;
    // Juster target med gjenværende
    this.target = Date.now() + this.remainingMs;
    this._loop();
  }

  stop() {
    if (this._raf) clearTimeout(this._raf);
    this._raf = null;
    this.target = null;
    this.paused = false;
    this.remainingMs = 0;
  }
}

export function formatMMSS(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
