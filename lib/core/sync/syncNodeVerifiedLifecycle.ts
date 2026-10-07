import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { collectNodeVersionPayloads } from './nodeVersionPayloadCollector.js';
import { buildVerifiedResolutionRecord } from './syncNodeResolutionBody.js';
import { applyVerifiedSyncNodesWithDbPort } from './syncNodeVerifiedApplyExecutor.js';
import { loadCurrentVerifiedSyncNode, loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { availableTextAlternatives, textAlternatives } from './topicTextState.js';

/** Expiration retains the original selection and changes only the surviving attachment list. */
export async function expireVerifiedTopicText(db: DbPort, nodeId: string, now: string) {
  return db.transaction(async (tx) => {
    const [expired] = await tx.query<{ id: string }>(
      `SELECT n.id FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id,
       json_each(v.snapshot_json, '$.text_alternatives') entry
       WHERE n.id = ? AND json_extract(entry.value, '$.expires_at') <= ? LIMIT 1`, [nodeId, now]);
    if (!expired) return;
    const current = await loadCurrentVerifiedSyncNode(tx, nodeId);
    if (!current || current.metadata.snapshot.kind !== 'topic' || current.body.kind !== 'readable') return;
    const retained = availableTextAlternatives(current.metadata, now);
    if (retained.length === textAlternatives(current.metadata).length) return;
    const resolution = await buildVerifiedResolutionRecord(tx, [current], current, current.body.ref, {
      ...current.metadata.snapshot, text_alternatives: retained
    });
    const retainedHashes = new Set(retained.map((entry) => entry.body_blob_hash));
    const record = { ...resolution, alternativeBodies: current.alternativeBodies.filter((body) => retainedHashes.has(body.hash)) };
    const result = await applyVerifiedSyncNodesWithDbPort(tx, [record], { operation: 'local_mutation' });
    if (!result.appliedIds.includes(nodeId)) throw new Error('text_alternative_expiry_not_applied');
    await collectNodeVersionPayloads(tx, nodeId, Number.MAX_SAFE_INTEGER, false, 'chunked');
  });
}

async function isNewVerifiedFolderPlacement(port: DbPort, child: VerifiedFramedSyncNode) {
  if (!child.metadata.parent_version_id) return true;
  const previous = await loadVerifiedSyncNodeVersion(port, child.metadata.parent_version_id, false);
  return previous !== null && previous.metadata.snapshot.parent_id !== child.metadata.snapshot.parent_id;
}

export async function reviveDeletedFoldersForVerifiedChildren(
  port: DbPort, records: readonly VerifiedFramedSyncNode[], appliedNodeIds: ReadonlySet<string>
) {
  for (const child of records) {
    const parentId = child.metadata.snapshot.parent_id;
    if (!parentId || !appliedNodeIds.has(child.metadata.object_id) || child.metadata.snapshot.deleted_at) continue;
    const parent = await loadCurrentVerifiedSyncNode(port, parentId);
    if (!parent || parent.metadata.snapshot.kind !== 'folder' || !parent.metadata.snapshot.deleted_at) continue;
    if ((child.metadata.version_created_at ?? '') <= parent.metadata.snapshot.deleted_at) continue;
    if (!await isNewVerifiedFolderPlacement(port, child)) continue;
    if (parent.body.kind !== 'readable') throw new Error(`sync_node_version_body_unavailable:${parent.metadata.version_id}`);
    const restored = await buildVerifiedResolutionRecord(port, [parent], parent, parent.body.ref,
      { ...parent.metadata.snapshot, deleted_at: null });
    const applied = await applyVerifiedSyncNodesWithDbPort(port, [restored], {
      operation: 'local_restore'
    });
    if (!applied.appliedIds.includes(parentId)) throw new Error(`sync_folder_later_child_restore_failed:${parentId}`);
  }
}
