// Estimate only measured reading work; do not invent a countdown before it starts.
export class LoadProgress {
  constructor(now = 0) { this.reset(now); }
  reset(now) { this.started = now; this.fraction = 0; this.samples = [{ time: now, fraction: 0 }]; this.lastChange = now; }
  update(fraction, now) {
    if (!Number.isFinite(fraction)) return;
    const next = Math.max(this.fraction, Math.min(1, Math.max(0, fraction)));
    if (next > this.fraction) this.lastChange = now;
    this.fraction = next;
    if (now - this.samples.at(-1).time >= 250) this.samples.push({ time: now, fraction: next });
    while (this.samples.length > 2 && now - this.samples[1].time > 8000) this.samples.shift();
  }
  remaining(now) {
    if (this.fraction >= 1) return 0;
    if (now - this.started < 1200 || this.fraction < 0.02 || now - this.lastChange > 10000) return null;
    const first = this.samples[0];
    const elapsed = (now - first.time) / 1000;
    const work = this.fraction - first.fraction;
    return elapsed >= 1 && work > 0 ? (1 - this.fraction) * elapsed / work : null;
  }
  text(now) { return remainingText(this.remaining(now)); }
}
export function remainingText(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return 'Estimating time remaining…';
  if (seconds <= 0) return 'Complete';
  if (seconds < 5) return 'A few seconds left';
  if (seconds < 60) return `About ${Math.min(60, Math.ceil(seconds / 5) * 5)} sec left`;
  if (seconds < 3600) return `About ${Math.ceil(seconds / 60)} min left`;
  return `About ${Math.ceil(seconds / 3600)} hr left`;
}
