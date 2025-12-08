// Enkel, presis timer basert på absolutt klokke (ikke drift)
export type TickCallback = (remainingMs: number) => void;


export class Timer {
private durationMs: number;
private endTs = 0;
private pausedAt = 0;
private rafId = 0;
private running = false;
private onTick: TickCallback;


constructor(durationMs: number, onTick: TickCallback) {
this.durationMs = durationMs;
this.onTick = onTick;
}


private tick = () => {
const remaining = Math.max(0, this.endTs - Date.now());
this.onTick(remaining);
if (remaining <= 0) { this.stop(); return; }
this.rafId = requestAnimationFrame(this.tick);
}


start() {
this.endTs = Date.now() + this.durationMs;
this.running = true;
this.rafId = requestAnimationFrame(this.tick);
}


pause() {
if (!this.running) return;
this.pausedAt = this.endTs - Date.now();
cancelAnimationFrame(this.rafId);
this.running = false;
}


resume() {
if (this.running || !this.pausedAt) return;
this.endTs = Date.now() + this.pausedAt;
this.pausedAt = 0;
this.running = true;
this.rafId = requestAnimationFrame(this.tick);
}


toggle() {
if (this.running) this.pause(); else if (this.pausedAt) this.resume();
}


stop() {
cancelAnimationFrame(this.rafId);
this.running = false;
this.pausedAt = 0;
}
}
