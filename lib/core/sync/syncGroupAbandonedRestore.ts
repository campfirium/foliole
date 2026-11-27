import type { SyncGroupMemberStatePayload } from '../../platform/syncGroupMemberStateContract.js';
import type { SyncGroupRestoreState } from '../../platform/syncGroupRestoreContract.js';

/**
 * A source that is now replacing its own library with group data has withdrawn the restore it published,
 * so nobody can receive that restore any more. Callers must keep it pending while an overwrite is half
 * received, because the local library is incomplete then.
 */
export function syncGroupRestoreAbandonedBySource(
  local: SyncGroupRestoreState | null, incoming: SyncGroupMemberStatePayload
) {
  return Boolean(local && !local.applied && incoming.adopting_from &&
    local.event.source_device_identity_key === incoming.sender_device_identity_key);
}
