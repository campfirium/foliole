import { ForegroundTimeCounter, type ForegroundTimeBucket, type ForegroundClock } from './foregroundTime.js';

export function addForegroundBuckets(left: readonly ForegroundTimeBucket[], right: readonly ForegroundTimeBucket[]) {
  const days = new Map(left.map((bucket) => [bucket.day, bucket.durationMs]));
  for (const bucket of right) days.set(bucket.day, (days.get(bucket.day) ?? 0) + bucket.durationMs);
  return [...days].map(([day, durationMs]) => ({ day, durationMs }));
}

export class ForegroundTimeRecording {
  private counter: ForegroundTimeCounter;
  private retained: ForegroundTimeBucket[] | null = null;
  private active = false;
  private hour = 4;

  constructor(private readonly clock: () => ForegroundClock, public sourceId: string, baseline: ForegroundTimeBucket[]) {
    this.counter = new ForegroundTimeCounter(clock, baseline);
  }

  get maintaining() { return this.retained !== null; }

  setActive(active: boolean, hour: number) {
    this.active = active;
    this.hour = hour;
    this.counter.setActive(active, hour);
  }

  checkpoint() { return this.counter.checkpoint(); }

  snapshot(): { sourceId: string; buckets: ForegroundTimeBucket[]; unassigned?: boolean } {
    return { sourceId: this.sourceId, buckets: this.counter.snapshot(), ...(this.maintaining ? { unassigned: true } : {}) };
  }

  beginMaintenance() {
    if (this.retained) throw new Error('Foreground time maintenance is already in progress');
    this.retained = this.counter.checkpoint();
    this.counter = new ForegroundTimeCounter(this.clock);
    this.counter.setActive(this.active, this.hour);
    return { sourceId: this.sourceId, buckets: this.retained };
  }

  finishMaintenance(sourceId: string, baseline: ForegroundTimeBucket[]) {
    if (!this.retained) throw new Error('Foreground time maintenance is not in progress');
    this.counter = new ForegroundTimeCounter(this.clock, addForegroundBuckets(baseline, this.counter.checkpoint()));
    this.sourceId = sourceId;
    this.retained = null;
    this.counter.setActive(this.active, this.hour);
  }

  cancelMaintenance() {
    if (this.retained) this.finishMaintenance(this.sourceId, this.retained);
  }
}
