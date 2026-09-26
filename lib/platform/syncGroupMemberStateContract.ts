import type { SyncGroupDevicePayload } from './syncGroupContract.js';
import type {
  WatchedFolderConflictDecision,
  WatchedFolderGroupSource
} from './watchedFolderConflictContract.js';

export const SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION = 1 as const;

export type SyncGroupRemovalConfirmationKind = 'enforced' | 'target_exit';

export interface SyncGroupRemovalConfirmationPayload {
  confirmed_at: string;
  confirming_device_identity_key: string;
  kind: SyncGroupRemovalConfirmationKind;
}

export interface SyncGroupRemovalDecisionPayload {
  completed_at: string | null;
  confirmations: SyncGroupRemovalConfirmationPayload[];
  created_at: string;
  decision_id: string;
  initiated_by_device_identity_key: string;
  superseded_at: string | null;
  target_device_identity_key: string;
}

export interface SyncGroupMemberStatePayload {
  contract_version: typeof SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION;
  devices: SyncGroupDevicePayload[];
  group_id: string;
  removals: SyncGroupRemovalDecisionPayload[];
  sender_device_identity_key: string;
  watched_sources?: WatchedFolderGroupSource[];
  watched_decisions?: WatchedFolderConflictDecision[];
}

export function parseSyncGroupMemberState(value: unknown): SyncGroupMemberStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const raw = value as Partial<SyncGroupMemberStatePayload>;
  if (raw.contract_version !== SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION ||
      !text(raw.group_id) || !text(raw.sender_device_identity_key) ||
      !Array.isArray(raw.devices) || !Array.isArray(raw.removals) ||
      (raw.watched_sources !== undefined && !Array.isArray(raw.watched_sources)) ||
      (raw.watched_decisions !== undefined && !Array.isArray(raw.watched_decisions))) return invalid();
  return raw as SyncGroupMemberStatePayload;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function invalid(): never {
  throw new Error('sync_group_member_state_invalid');
}
