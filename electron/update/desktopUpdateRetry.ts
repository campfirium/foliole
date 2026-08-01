const DEFAULT_RETRY_DELAYS_MS = [30_000, 120_000, 300_000] as const;

export class DesktopUpdateRetry {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delays: readonly number[] = DEFAULT_RETRY_DELAYS_MS) {}

  schedule(callback: () => void) {
    if (this.timer) return true;
    const delay = this.delays[this.attempt];
    if (delay === undefined) return false;
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      callback();
    }, delay);
    return true;
  }

  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.attempt = 0;
  }
}
