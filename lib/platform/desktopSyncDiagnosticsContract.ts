import type { NativeCompanionSyncEvent, DesktopSyncGroupOverviewPayload } from './nativeCompanionSyncContract.js';
import type { SyncDiagnosticSnapshot } from './syncDiagnosticsContract.js';

export type DesktopSyncStage = 'run' | 'compatibility' | 'member_state' | 'sync_pack' | 'resources' | 'version_receipt' | 'sync_push';

export interface DesktopSyncActivityEvent extends NativeCompanionSyncEvent {
  direction: 'send' | 'receive' | 'exchange' | 'local';
  peer_device_id: string | null;
  peer_device_name: string | null;
  stage: DesktopSyncStage;
  confirmation?: 'sent' | 'saved' | 'confirmed' | 'blocked';
  record_count?: number;
}

export interface DesktopSyncDiagnosticsPayload {
  report_text: string;
  active_run_ids: string[];
  active_run: boolean;
  activity: DesktopSyncActivityEvent[];
  overview: DesktopSyncGroupOverviewPayload;
  snapshot: SyncDiagnosticSnapshot;
}
