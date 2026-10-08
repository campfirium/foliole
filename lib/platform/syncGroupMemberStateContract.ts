import type { SyncGroupDevicePayload } from './syncGroupContract.js';
import { parseSyncGroupRestoreEvent, type SyncGroupRestoreState } from './syncGroupRestoreContract.js';
import { parseSyncProtocolDescriptor, type SyncProtocolDescriptor } from './syncProtocolContract.js';
import type {
  WatchedFolderConflictDecision,
  WatchedFolderGroupSource
} from './watchedFolderConflictContract.js';

export const SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION = 3 as const;

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
  adopting_from?: string;
  adopted_from?: string;
  devices: SyncGroupDevicePayload[];
  group_id: string;
  library_epoch: string;
  proof_revision: number;
  protocol?: SyncProtocolDescriptor;
  source_proof_revisions: Record<string, number>;
  removals: SyncGroupRemovalDecisionPayload[];
  restore: SyncGroupRestoreState | null;
  sender_device_identity_key: string;
  watched_sources?: WatchedFolderGroupSource[];
  watched_decisions?: WatchedFolderConflictDecision[];
}

export function parseSyncGroupMemberState(value: unknown): SyncGroupMemberStatePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const raw = value as Partial<SyncGroupMemberStatePayload>;
  if (raw.protocol !== undefined && !parseSyncProtocolDescriptor(raw.protocol)) return invalid();
  if (raw.contract_version !== SYNC_GROUP_MEMBER_STATE_CONTRACT_VERSION ||
      !text(raw.group_id) || !text(raw.sender_device_identity_key) ||
      (raw.adopting_from !== undefined && (!text(raw.adopting_from) || raw.adopting_from === raw.sender_device_identity_key)) ||
      (raw.adopted_from !== undefined && (!text(raw.adopted_from) || raw.adopted_from === raw.sender_device_identity_key || raw.adopting_from !== undefined)) ||
      !text(raw.library_epoch) || !Number.isSafeInteger(raw.proof_revision) ||
      (raw.proof_revision ?? -1) < 0 ||
      !validSourceProofRevisions(raw.source_proof_revisions) ||
      !Array.isArray(raw.devices) || !Array.isArray(raw.removals) ||
      !validRestoreState(raw.restore, raw.group_id) ||
      (raw.watched_sources !== undefined && !Array.isArray(raw.watched_sources)) ||
      (raw.watched_decisions !== undefined && !Array.isArray(raw.watched_decisions))) return invalid();
  return raw as SyncGroupMemberStatePayload;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSourceProofRevisions(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, revision]) => text(key) &&
      Number.isSafeInteger(revision) && (revision as number) >= 0));
}

function validRestoreState(value: unknown, groupId: string | undefined) {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<SyncGroupRestoreState>;
  if (typeof raw.applied !== 'boolean') return false;
  try {
    return parseSyncGroupRestoreEvent(raw.event).group_id === groupId;
  } catch {
    return false;
  }
}

function invalid(): never {
  throw new Error('sync_group_member_state_invalid');
}
