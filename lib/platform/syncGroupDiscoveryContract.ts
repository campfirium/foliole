import type { DesktopSyncGroupJoinCandidatePayload } from './nativeCompanionSyncContract.js';

export type SyncGroupDiscoveryStatus =
  | 'searching'
  | 'results'
  | 'permission_required'
  | 'unavailable'
  | 'incompatible'
  | 'connection_failed'
  | 'stopped';

export interface SyncGroupDiscoverySnapshot {
  candidates: DesktopSyncGroupJoinCandidatePayload[];
  change: 'started' | 'found' | 'changed' | 'lost' | 'failed' | 'stopped';
  error_code: string | null;
  status: SyncGroupDiscoveryStatus;
}

export const STOPPED_SYNC_GROUP_DISCOVERY: SyncGroupDiscoverySnapshot = {
  candidates: [],
  change: 'stopped',
  error_code: null,
  status: 'stopped'
};
