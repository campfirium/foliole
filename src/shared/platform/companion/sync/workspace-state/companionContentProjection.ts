import { NODE_RESOURCES_SQL } from '../../../../../../lib/core/database/nodeResourcesSql';
import type { WorkspaceSnapshot } from '../../../../../../lib/core/database/workspaceSnapshot';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';
import { attachIosWorkspaceNodeAttachments, buildIosWorkspaceNodes } from './iosCompanionWorkspaceSnapshotRows';

export async function loadCompanionContentProjection(db: DbPort, nodeId: string) {
  return db.transaction(async tx => {
    const [host] = await tx.query("SELECT value FROM companion_meta WHERE key = 'host_name'");
    if (typeof host?.value !== 'string' || !host.value) throw new Error('Companion Host is unavailable.');
    const { nodesById } = buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(tx, host.value, nodeId));
    const attachments = await tx.query(`SELECT * FROM (${NODE_RESOURCES_SQL})
      WHERE node_id IN (SELECT id FROM nodes WHERE id = ? OR parent_id = ?)`, [nodeId, nodeId]);
    attachIosWorkspaceNodeAttachments(nodesById, attachments, host.value);
    return nodesById;
  });
}

// Only the content-save path may use this projection. Missing anchor text marks the child
// unmapped; it does not delete/reparent it. The save retains the title and only remaps
// direct-child anchors. Structural mutations still require the normalized full snapshot.
export function mergeCompanionContentProjection(
  current: WorkspaceSnapshot, nodes: WorkspaceSnapshot['nodesById']
): WorkspaceSnapshot {
  return {
    ...current,
    nodesById: { ...current.nodesById, ...nodes },
    trashedNodeIds: [
      ...current.trashedNodeIds.filter(id => !(id in nodes)),
      ...Object.values(nodes).filter(node => node.deletedAt).map(node => node.id)
    ]
  };
}
