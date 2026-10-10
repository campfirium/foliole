import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import type { SyncGroupLocalAdoption } from '../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress } from '../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { SyncGroupMemberStatePayload } from '../../../../../lib/platform/syncGroupMemberStateContract.js';
import type { SyncGroupRestoreState } from '../../../../../lib/platform/syncGroupRestoreContract.js';
import { syncGroupRestorePeersReady } from '../../../../../lib/platform/syncGroupRestoreContract.js';
import { evaluateSyncProtocolCompatibility } from '../../../../../lib/platform/syncProtocolContract.js';

export function assertIncomingProtocolCompatible(incoming: SyncGroupMemberStatePayload) {
  const compatibility = evaluateSyncProtocolCompatibility(incoming.protocol);
  if (compatibility.status !== 'compatible') {
    throw new Error(`sync_group_peer_incompatible:${compatibility.reason ?? 'unknown'}`);
  }
}

export function companionMemberStateReady(incoming: SyncGroupMemberStatePayload,
  adoption: SyncGroupLocalAdoption | null, restore: SyncGroupRestoreState | null, localDeviceId: string) {
  return adoption ? adoption.providerDeviceId === incoming.sender_device_identity_key &&
    !incoming.adopting_from && incoming.restore?.applied !== false
    : incoming.adopting_from === localDeviceId || syncGroupRestorePeersReady(restore, incoming.restore);
}

/** Restore dependencies may arrive before ordinary bilateral synchronization is ready. */
export async function canMergeRestoreSourceMembers(db: DbPort, incoming: SyncGroupMemberStatePayload,
  restore: SyncGroupRestoreState | null, localDeviceId: string) {
  if (!restore || restore.applied || !incoming.restore?.applied || incoming.adopting_from ||
      restore.event.source_device_identity_key !== incoming.sender_device_identity_key ||
      restore.event.group_id !== incoming.restore.event.group_id ||
      restore.event.restore_id !== incoming.restore.event.restore_id ||
      restore.event.restored_at !== incoming.restore.event.restored_at ||
      restore.event.source_device_identity_key !== incoming.restore.event.source_device_identity_key) return false;
  const progress = await loadSyncGroupOverwriteProgress(db);
  if (progress && (progress.groupId !== incoming.group_id || progress.overwriteId !== restore.event.restore_id ||
      progress.providerDeviceId !== incoming.sender_device_identity_key ||
      progress.providerLibraryEpoch !== incoming.library_epoch || progress.receiverDeviceId !== localDeviceId ||
      progress.receiverLibraryEpoch !== restore.event.restore_id)) throw new Error('sync_group_overwrite_source_changed');
  return true;
}
