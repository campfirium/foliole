import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import { buildResolutionRecord } from './syncNodeResolution.js';

async function isNewFolderPlacement(port: DbPort, child: NativeSyncNodeRecord) {
  if (!child.parent_version_id) return true;
  const previous = await loadStoredSyncNodeVersionRecord(port, child.parent_version_id, false);
  return previous !== null && previous.snapshot.parent_id !== child.snapshot.parent_id;
}

export async function reviveDeletedFoldersForLaterChildren(
  port: DbPort,
  records: NativeSyncNodeRecord[],
  appliedNodeIds: ReadonlySet<string>
) {
  for (const child of records) {
    const parentId = child.snapshot.parent_id;
    if (!parentId || !appliedNodeIds.has(child.object_id) || child.snapshot.deleted_at) continue;
    const parent = await loadCurrentSyncNodeRecord(port, parentId);
    if (!parent || parent.snapshot.kind !== 'folder' || !parent.snapshot.deleted_at) continue;
    if ((child.version_created_at ?? '') <= parent.snapshot.deleted_at) continue;
    if (!await isNewFolderPlacement(port, child)) continue;
    const restored = buildResolutionRecord(
      [parent], parent, parent.body_text ?? parent.snapshot.content ?? '',
      { ...parent.snapshot, deleted_at: null }
    );
    const applied = await applySyncNodesWithDbPort(port, [restored], {
      enqueueSearchInvalidations: false,
      operation: 'local_restore'
    });
    if (!applied.appliedIds.includes(parentId)) {
      throw new Error(`sync_folder_later_child_restore_failed:${parentId}`);
    }
  }
}
