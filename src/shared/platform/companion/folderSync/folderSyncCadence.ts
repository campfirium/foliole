import { createMemberSyncCadence, type MemberSyncCadence } from '../../../../../lib/core/sync/memberSyncCadence.js';
import type { FolderSyncLocation } from '../../../../../lib/platform/nativeFolderSyncContract.js';

import type { createFolderSyncService } from './folderSyncService.js';

type Reason = 'ready' | 'foreground' | 'mutation' | 'freshness';
export type FolderSyncSettingsState = { enabled: boolean; location: FolderSyncLocation | null };
type Input = {
  service: ReturnType<typeof createFolderSyncService>;
  readState(): Promise<FolderSyncSettingsState>;
  readActive(): Promise<boolean>;
};

class FolderSyncCadence {
  private active = false;
  private stopped = false;
  private revision = 0;
  private state: FolderSyncSettingsState | null = null;
  private cadence: MemberSyncCadence<Reason>;
  private unsubscribe: () => void;

  constructor(private input: Input) {
    this.cadence = createMemberSyncCadence<Reason>({ getActiveRun: input.service.getActiveRun,
      didSync: result => result === true, run: () => this.run() });
    this.unsubscribe = input.service.subscribe(event => {
      void this.refresh(event === 'location' ? 'ready' : undefined).catch(() => undefined);
    });
  }

  private eligible() { return !this.stopped && this.active && Boolean(this.state?.enabled && this.state.location?.authorized); }

  private async run() {
    if (!this.eligible() || !await this.input.readActive()) return false;
    const current = await this.input.readState();
    if (!this.eligible() || !current.enabled || !current.location?.authorized) return false;
    await this.input.service.write();
    return true;
  }

  async refresh(reason?: Reason) {
    const revision = ++this.revision;
    const next = await this.input.readState();
    if (this.stopped || revision !== this.revision) return;
    this.state = next;
    const last = next.location?.completion?.checkedAt;
    const at = last ? Date.parse(last) : undefined;
    this.cadence.updateFreshness({ eligible: this.eligible(), input: 'freshness',
      ...(at !== undefined && Number.isFinite(at) ? { lastActualSyncAt: at } : {}) });
    if (reason === 'mutation') return this.cadence.requestMutation(reason);
    if (reason) return this.cadence.requestImmediate(reason);
  }

  async foreground() {
    if (this.active || this.stopped) return;
    this.active = true;
    return this.refresh('foreground');
  }

  background() {
    this.active = false;
    this.invalidate();
  }

  invalidate() {
    this.revision++;
    this.state = null;
    this.cadence.updateFreshness({ eligible: false, input: null });
    this.input.service.cancel();
  }

  stop() {
    this.stopped = true;
    this.revision++;
    this.cadence.stop();
    this.input.service.cancel();
    this.unsubscribe();
  }
}

/** Uses the existing device-sync cadence; this adapter only supplies folder eligibility and host events. */
export function createFolderSyncCadence(input: Input) { return new FolderSyncCadence(input); }
