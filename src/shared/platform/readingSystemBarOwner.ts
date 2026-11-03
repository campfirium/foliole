/** Owns the latest reading target across renderer mounts and delayed host calls. */
export class ReadingSystemBarOwner {
  private target = false;
  private applied: boolean | undefined;
  private revision = 0;
  private pending: Promise<void> | null = null;
  private failed = false;
  private listeners = new Set<() => void>();

  constructor(private readonly apply: (hidden: boolean) => Promise<void>) {}

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

  request(hidden: boolean, force = false): Promise<void> {
    if (hidden === this.target && this.pending) return this.pending;
    if (hidden === this.target && hidden === this.applied && !force && !this.failed) return Promise.resolve();
    this.target = hidden;
    this.revision += 1;
    if (!this.pending) this.pending = this.drain().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async drain() {
    let completed: number;
    do {
      completed = this.revision;
      const hidden = this.target;
      try {
        await this.apply(hidden);
        this.applied = hidden;
        if (completed === this.revision) this.failed = false;
      } catch {
        if (completed === this.revision) this.failed = true;
      }
      this.listeners.forEach(listener => listener());
    } while (completed !== this.revision);
  }
}
