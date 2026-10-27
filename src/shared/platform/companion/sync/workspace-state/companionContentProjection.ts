import { NODE_RESOURCES_SQL } from '../../../../../../lib/core/database/nodeResourcesSql';
import type { WorkspaceNodeSnapshot } from '../../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';
import { attachIosWorkspaceNodeAttachments, buildIosWorkspaceNodes } from './iosCompanionWorkspaceSnapshotRows';

export type CompanionContentNode = Omit<WorkspaceNodeSnapshot, 'readwiseRemoteLifecycle'>;

export async function loadCompanionContentProjection(db: DbPort, nodeIds: readonly string[]): Promise<Record<string, CompanionContentNode>> {
  return db.transaction(async tx => {
    const [host] = await tx.query("SELECT value FROM companion_meta WHERE key = 'host_name'");
    if (typeof host?.value !== 'string' || !host.value) throw new Error('Companion Host is unavailable.');
    const { nodesById } = buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(tx, host.value, nodeIds));
    const attachments = await tx.query(`SELECT * FROM (${NODE_RESOURCES_SQL})
      WHERE node_id IN (SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
        OR parent_id IN (SELECT value FROM json_each(?)))`, [JSON.stringify(nodeIds), JSON.stringify(nodeIds)]);
    attachIosWorkspaceNodeAttachments(nodesById, attachments, host.value);
    // An unread source must not be represented as an observed null lifecycle.
    for (const node of Object.values(nodesById)) delete node.readwiseRemoteLifecycle;
    return nodesById;
  });
}
