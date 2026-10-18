import { NODE_RESOURCES_SQL } from '../../../../../../lib/core/database/nodeResourcesSql';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';
import { attachIosWorkspaceNodeAttachments, buildIosWorkspaceNodes } from './iosCompanionWorkspaceSnapshotRows';

export async function loadCompanionContentProjection(db: DbPort, nodeIds: readonly string[]) {
  return db.transaction(async tx => {
    const [host] = await tx.query("SELECT value FROM companion_meta WHERE key = 'host_name'");
    if (typeof host?.value !== 'string' || !host.value) throw new Error('Companion Host is unavailable.');
    const { nodesById } = buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(tx, host.value, nodeIds));
    const attachments = await tx.query(`SELECT * FROM (${NODE_RESOURCES_SQL})
      WHERE node_id IN (SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
        OR parent_id IN (SELECT value FROM json_each(?)))`, [JSON.stringify(nodeIds), JSON.stringify(nodeIds)]);
    attachIosWorkspaceNodeAttachments(nodesById, attachments, host.value);
    return nodesById;
  });
}
