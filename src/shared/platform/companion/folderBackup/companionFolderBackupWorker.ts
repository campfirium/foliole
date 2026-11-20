interface BackupWorkerPort {
  saveEnabled(enabled: boolean): Promise<void>;
  run(continueWork: () => boolean): Promise<{ errorMessage: string | null }>;
}

/** A round reads and fingerprints the whole database on both sides even when only one page differs,
 * so commit wakes wait for a quiet window (bounded by maxWaitMs) instead of starting a round each. */
export interface BackupWorkerTiming { startMs: number; quietMs: number; maxWaitMs: number }
export const defaultBackupWorkerTiming: BackupWorkerTiming = { startMs: 150, quietMs: 5_000, maxWaitMs: 60_000 };

/** One event-driven worker; failures wait for a new commit or foreground/explicit retry, never a retry timer. */
export class CompanionFolderBackupWorker {
  private enabled: boolean;
  private persistedEnabled: boolean;
  private settingVersion = 0;
  private settingTail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failed = false;
  private revision = 0;
  private dueAt: number | null = null;
  private quietSince: number | null = null;
  private urgent = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(enabled: boolean, private readonly port: BackupWorkerPort,
    private readonly timing: BackupWorkerTiming = defaultBackupWorkerTiming) {
    this.enabled = enabled; this.persistedEnabled = enabled;
  }

  get automatic() { return this.enabled; }

  setEnabled(enabled: boolean, validate?: () => Promise<void>) {
    const version = ++this.settingVersion;
    if (!enabled) { this.enabled = false; this.cancelRequest(); }
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

  /** `quiet` requests coalesce until commits pause; other requests start promptly and are never postponed. */
  wake(retry = false, quiet = false) {
    if (retry) { this.failed = false; this.revision++; }
    if (this.closed || !this.enabled || this.failed) return;
    const now = Date.now();
    if (!quiet) {
      this.urgent = true;
      this.dueAt = Math.min(this.dueAt ?? Infinity, now + this.timing.startMs);
    } else if (!this.urgent) {
      this.quietSince ??= now;
      this.dueAt = Math.min(now + this.timing.quietMs, this.quietSince + this.timing.maxWaitMs);
    }
    this.schedule();
  }

  /** Start any coalesced request now, e.g. before the host may suspend the App. */
  flush() { if (this.dueAt !== null) this.wake(); }

  private schedule() {
    if (this.running || this.dueAt === null) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.cancelRequest();
      if (!this.enabled || this.closed || this.failed) return;
      this.running = this.runOnce().finally(() => { this.running = null; this.schedule(); });
    }, Math.max(0, this.dueAt - Date.now()));
  }

  private async runOnce() {
    const revision = this.revision;
    try {
      const result = await this.port.run(() => this.enabled && !this.closed);
      if (result.errorMessage) this.failed = revision === this.revision;
    } catch { this.failed = revision === this.revision; }
  }

  async stop() {
    this.closed = true;
    this.cancelRequest();
    await this.running;
  }

  private cancelRequest() {
    this.clearTimer();
    this.dueAt = null; this.quietSince = null; this.urgent = false;
  }

  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
