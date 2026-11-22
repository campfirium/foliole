import { NODE_RESOURCES_SQL } from '../../../../../../lib/core/database/nodeResourcesSql';
import type { WorkspaceNodeSnapshot } from '../../../../../../lib/core/database/workspaceSnapshotHelpers';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort';

import { loadCompanionSnapshotNodeRows } from './companionSnapshotNodeRows';
import { attachIosWorkspaceNodeAttachments, buildIosWorkspaceNodes } from './iosCompanionWorkspaceSnapshotRows';

export type CompanionContentNode = Omit<WorkspaceNodeSnapshot, 'readwiseRemoteLifecycle'>;

/**
 * Projects the named nodes and their children; `exact` projects only the named nodes. A caller that has read the
 * Companion Host in the same transaction passes it; one that never reads attachments skips them.
 */
export async function loadCompanionContentProjection(db: DbPort, nodeIds: readonly string[],
  exact = false, knownHost?: string, attachments = true): Promise<Record<string, CompanionContentNode>> {
  return db.transaction(async tx => {
    const host = knownHost ? { value: knownHost }
      : (await tx.query("SELECT value FROM companion_meta WHERE key = 'host_name'"))[0];
    if (typeof host?.value !== 'string' || !host.value) throw new Error('Companion Host is unavailable.');
    const { nodesById } = buildIosWorkspaceNodes(await loadCompanionSnapshotNodeRows(tx, host.value, nodeIds, exact));
    if (attachments) {
      const rows = await tx.query(`SELECT * FROM (${NODE_RESOURCES_SQL})
        WHERE node_id IN (SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))${exact ? ''
          : ' OR parent_id IN (SELECT value FROM json_each(?))'})`, exact ? [JSON.stringify(nodeIds)] : [JSON.stringify(nodeIds), JSON.stringify(nodeIds)]);
      attachIosWorkspaceNodeAttachments(nodesById, rows, host.value);
    }
    // An unread source must not be represented as an observed null lifecycle.
    for (const node of Object.values(nodesById)) delete node.readwiseRemoteLifecycle;
    return nodesById;
  });
}
