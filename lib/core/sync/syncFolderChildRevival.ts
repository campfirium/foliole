
import type { DbPort } from './dbPort.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';
import { loadCurrentSyncNodeRecord, loadStoredSyncNodeVersionRecord } from './syncNodeGraph.js';
import type { SyncNodeRecordMetadata } from './syncNodeRecordSource.js';
import { buildResolutionRecord } from './syncNodeResolution.js';

async function isNewFolderPlacement(port: DbPort, child: SyncNodeRecordMetadata) {
  if (!child.parent_version_id) return true;
  const previous = await loadStoredSyncNodeVersionRecord(port, child.parent_version_id, false);
  return previous !== null && previous.snapshot.parent_id !== child.snapshot.parent_id;
}

/** One read finds the parents that can be deleted folders; unpublished local rows stay candidates. */
async function loadDeletedFolderCandidates(port: DbPort, records: readonly SyncNodeRecordMetadata[],
  appliedNodeIds: ReadonlySet<string>) {
  const parentIds = [...new Set(records.filter(child => appliedNodeIds.has(child.object_id) && !child.snapshot.deleted_at)
    .map(child => child.snapshot.parent_id).filter((id): id is string => Boolean(id)))];
  if (!parentIds.length) return new Set<string>();
  const rows = await port.query<{ id: string }>(`SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    AND kind = 'folder' AND (deleted_at IS NOT NULL OR sync_dirty = 1)`, [JSON.stringify(parentIds)]);
  return new Set(rows.map(row => row.id));
}

export async function reviveDeletedFoldersForLaterChildren(
  port: DbPort,
  records: readonly SyncNodeRecordMetadata[],
  appliedNodeIds: ReadonlySet<string>
) {
  const revivedIds: string[] = [];
  const candidates = await loadDeletedFolderCandidates(port, records, appliedNodeIds);
  for (const child of records) {
    const parentId = child.snapshot.parent_id;
    if (!parentId || !appliedNodeIds.has(child.object_id) || child.snapshot.deleted_at) continue;
    if (!candidates.has(parentId)) continue;
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
    revivedIds.push(parentId);
    if (!applied.appliedIds.includes(parentId)) {
      throw new Error(`sync_folder_later_child_restore_failed:${parentId}`);
    }
  }
  return revivedIds;
}
