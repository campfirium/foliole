export interface ReadingSystemBarTarget { enabled: boolean; hidden: boolean }
const sameTarget = (a: ReadingSystemBarTarget, b: ReadingSystemBarTarget | undefined) =>
  a.enabled === b?.enabled && a.hidden === b?.hidden;

/** Owns the latest reading target across renderer mounts and delayed host calls. */
export class ReadingSystemBarOwner {
  private target: ReadingSystemBarTarget = { enabled: false, hidden: false };
  private applied: ReadingSystemBarTarget | undefined;
  private revision = 0;
  private pending: Promise<void> | null = null;
  private failed = false;
  private listeners = new Set<() => void>();

  constructor(private readonly apply: (target: ReadingSystemBarTarget) => Promise<void>) {}

  getError = () => this.failed;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  reportFailure = () => {
    this.failed = true;
    this.listeners.forEach(listener => listener());
  };
  retry = () => this.request(this.target, true);

  request(target: ReadingSystemBarTarget, force = false): Promise<void> {
    if (sameTarget(target, this.target) && this.pending) return this.pending;
    if (sameTarget(target, this.target) && sameTarget(target, this.applied) && !force && !this.failed) return Promise.resolve();
    this.target = target;
    this.revision += 1;
    if (!this.pending) this.pending = Promise.resolve().then(() => this.drain()).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async drain() {
    let completed: number;
    do {
      completed = this.revision;
      const target = this.target;
      try {
        await this.apply(target);
        this.applied = target;
        if (completed === this.revision) this.failed = false;
      } catch {
        if (completed === this.revision) this.failed = true;
      }
      this.listeners.forEach(listener => listener());
    } while (completed !== this.revision);
  }
}
