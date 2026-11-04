interface BackupWorkerPort {
  saveEnabled(enabled: boolean): Promise<void>;
  run(continueWork: () => boolean): Promise<{ errorMessage: string | null }>;
}

/** One event-driven worker; failures wait for a new commit or foreground/explicit retry, never a retry timer. */
export class CompanionFolderBackupWorker {
  private enabled: boolean;
  private persistedEnabled: boolean;
  private settingVersion = 0;
  private settingTail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failed = false;
  private revision = 0;
  private requested = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(enabled: boolean, private readonly port: BackupWorkerPort) { this.enabled = enabled; this.persistedEnabled = enabled; }

  get automatic() { return this.enabled; }

  setEnabled(enabled: boolean, validate?: () => Promise<void>) {
    const version = ++this.settingVersion;
    if (!enabled) { this.enabled = false; this.clearTimer(); this.requested = false; }
    const setting = this.settingTail.catch(() => undefined).then(async () => {
      try {
        await validate?.();
        await this.port.saveEnabled(enabled);
        this.persistedEnabled = enabled;
        if (version === this.settingVersion) { this.enabled = enabled; if (enabled) this.wake(true); }
      } catch (error) {
        if (version === this.settingVersion) { this.enabled = this.persistedEnabled; if (this.enabled) this.wake(); }
        throw error;
      }
    });
    this.settingTail = setting;
    return setting;
  }

  wake(retry = false) {
    if (retry) { this.failed = false; this.revision++; }
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
      const revision = this.revision;
      try {
        const result = await this.port.run(() => this.enabled && !this.closed);
        if (result.errorMessage) this.failed = revision === this.revision;
      } catch { this.failed = revision === this.revision; }
    }
  }

  stop() { this.closed = true; this.requested = false; this.clearTimer(); }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
