interface BackupWorkerPort {
  saveEnabled(enabled: boolean): Promise<void>;
  run(continueWork: () => boolean): Promise<{ errorMessage: string | null }>;
}

/** One event-driven worker; failures wait for a foreground/explicit retry, never a retry timer. */
export class CompanionFolderBackupWorker {
  private enabled: boolean;
  private closed = false;
  private failed = false;
  private requested = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(enabled: boolean, private readonly port: BackupWorkerPort) { this.enabled = enabled; }

  get automatic() { return this.enabled; }

  async setEnabled(enabled: boolean) {
    const previous = this.enabled;
    if (!enabled) { this.enabled = false; this.clearTimer(); this.requested = false; }
    try { await this.port.saveEnabled(enabled); }
    catch (error) { this.enabled = previous; if (previous) this.wake(); throw error; }
    this.enabled = enabled;
    if (enabled) this.wake(true);
  }

  wake(retry = false) {
    if (retry) this.failed = false;
    if (this.closed || !this.enabled || this.failed) return;
    this.requested = true;
    if (!this.running && !this.timer) this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.drain().finally(() => { this.running = null; if (this.requested) this.wake(); });
    }, 150);
  }

  private async drain() {
    while (this.requested && this.enabled && !this.closed && !this.failed) {
      this.requested = false;
      try {
        const result = await this.port.run(() => this.enabled && !this.closed);
        if (result.errorMessage) this.failed = true;
      } catch { this.failed = true; }
    }
  }

  stop() { this.closed = true; this.requested = false; this.clearTimer(); }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
