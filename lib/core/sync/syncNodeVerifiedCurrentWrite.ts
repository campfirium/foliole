import type { DbPort } from './dbPort.js';
import type { VerifiedFramedSyncNode } from './framedSyncVerifiedNode.js';
import { repairDirectChildAnchorsForAppliedParent } from './syncNodeAnchorRepair.js';
import { loadAppliedNodeMutationState, recordAppliedNodeLocalOrigin } from './syncNodeAppliedMutationState.js';
import type { SyncNodeApplyOperation } from './syncNodeApplyRules.js';
import { buildRemoteNodeMetadataParams, UPDATE_REMOTE_NODE_SQL, UPSERT_REMOTE_NODE_SQL } from './syncNodeApplyStatements.js';
import { enqueueAppliedNodeBodySearchInvalidation } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { upsertVerifiedSyncNodeVersion } from './syncNodeVerifiedVersionWrite.js';

/** Apply an already selected current version. Conflict, tombstone and restore decisions belong to the caller. */
export async function writeVerifiedCurrentNode(db: DbPort, record: VerifiedFramedSyncNode, input: {
  enqueueSearchInvalidations?: boolean;
  excludedNodeIds?: ReadonlySet<string>;
  invalidatedAt: string;
  operation?: SyncNodeApplyOperation;
}) {
  const { metadata, body } = record;
  if (body.kind !== 'readable' || metadata.is_tombstone || metadata.snapshot.id !== metadata.object_id ||
      !metadata.version_id || !metadata.host_name || !metadata.version_created_at) {
    throw new Error('verified_current_node_identity_invalid');
  }
  return db.transaction(async (tx) => {
    const syncState = await loadAppliedNodeMutationState(tx, metadata.object_id, input.operation);
    if (await upsertVerifiedSyncNodeVersion(tx, record) === 'incomplete') throw new Error('verified_current_node_version_incomplete');
    const [existing] = await tx.query<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [metadata.object_id]);
    // Frontmatter lives in the verified header range, never a second potentially unbounded string.
    const params = buildRemoteNodeMetadataParams(metadata, body.ref.hash, 0, '');
    await tx.run(existing ? UPDATE_REMOTE_NODE_SQL : UPSERT_REMOTE_NODE_SQL,
      existing ? [...params.slice(1), params[0]!] : params);
    await recordAppliedNodeLocalOrigin(tx, metadata.version_id, input.operation);
    const repairs = metadata.snapshot.deleted_at ? { repaired: [], unmapped: [] } :
      await repairDirectChildAnchorsForAppliedParent({
        content: body.ref, ...(input.excludedNodeIds ? { excludedNodeIds: input.excludedNodeIds } : {}), parentNodeId: metadata.object_id,
        port: tx, sourceVersionId: metadata.version_id, updatedAt: metadata.snapshot.updated_at
      });
    await upsertAppliedNodeSyncState(tx, metadata, syncState);
    if (input.enqueueSearchInvalidations !== false) {
      await enqueueAppliedNodeBodySearchInvalidation(tx, metadata.object_id, input.invalidatedAt);
    }
    return repairs;
  });
}
