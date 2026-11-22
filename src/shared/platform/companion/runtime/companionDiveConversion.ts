import { loadCompanionWorkspaceNodeFromDb } from '../../../../../lib/core/database/companionWorkspaceNodeRead';
import { DIVE_CONVERSION_MATCHES_SQL } from '../../../../../lib/core/database/diveConversionMatchesSql';
import { parentOrderId } from '../../../../../lib/core/database/parentChildOrder';
import { VIRTUAL_ROOT_NODE_ID } from '../../../../../lib/core/database/specialNodeIds';
import { diveDirectoryConversionFields, resolveDiveDirectoryConversionTarget,
  type DiveDirectoryConversionTarget } from '../../../../../lib/core/nodes/diveDirectoryConversion';
import { stringifyManualChildOrder } from '../../../../../lib/core/nodes/manualChildOrder';
import { isManualVirtualNodeFilter } from '../../../../../lib/core/nodes/virtualNodeFilter';
import { readCurrentParentOrderWithDbPort, saveLocalCurrentParentOrderWithDbPort } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { ensureSyncSpecialRootNodes } from '../../../../../lib/core/sync/syncSpecialRootNodes';
import { loadIosCompanionWorkspaceSnapshot } from '../sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { saveCompanionVirtualDirectoryVersion } from './companionVirtualDirectoryVersion';
import { loadCompanionVirtualFolderResultIds } from './companionVirtualFolderResults';
import { iosCompanionHostName } from './iosCompanionMutationState';

/**
 * The folder has no children and only changes its own parent, filter and sources, so the refresh merges it (and the
 * Virtual root when this conversion creates it) as metadata instead of rereading the library.
 */
export function convertCompanionDiveDirectory(nodeId: string, target: DiveDirectoryConversionTarget, expectedFilter: string) {
  let changedNodeIds = [nodeId];
  return runCompanionHistoryMutation(async db => {
    const node = await loadCompanionWorkspaceNodeFromDb(db, nodeId);
    const [child] = await db.query('SELECT 1 FROM nodes WHERE parent_id = ? LIMIT 1', [nodeId]);
    if (!node || child || resolveDiveDirectoryConversionTarget(node) !== target || JSON.stringify(node.virtualFilter) !== expectedFilter) {
      throw new Error('Directory is unavailable for conversion');
    }
    const sourceOrder = target === 'dive' && !isManualVirtualNodeFilter(node.virtualFilter)
      ? { manual_child_order: await loadConversionMatchOrder(db, nodeId) } : {};
    const { parentNodeId, virtualFilter } = diveDirectoryConversionFields(target);
    const updatedAt = new Date().toISOString();
    const hostName = await iosCompanionHostName(db);
    if (parentNodeId) {
      changedNodeIds = [nodeId, ...await ensureSyncSpecialRootNodes(db, [{ nodeId: parentNodeId, referencedAt: updatedAt }])];
    }
    const parentId = parentOrderId(parentNodeId);
    const previous = await readCurrentParentOrderWithDbPort(db, parentId);
    await saveCompanionVirtualDirectoryVersion(db, { ...node, parentNodeId, updatedAt }, hostName, {
      ...sourceOrder, virtual_filter: JSON.stringify(virtualFilter)
    });
    await saveLocalCurrentParentOrderWithDbPort(db, {
      parentId, childIds: [...previous, nodeId], hostName, now: updatedAt
    });
  }, () => ({ kind: 'nodes', nodeIds: changedNodeIds, structure: true, metadata: true }));
}

// Matching a text or collection filter is a question about the whole library, so this one read stays.
async function loadConversionMatchOrder(db: DbPort, nodeId: string) {
  const snapshot = await loadIosCompanionWorkspaceSnapshot(db);
  if (!snapshot?.nodesById[nodeId]) throw new Error('Directory is unavailable for conversion');
  const ids = await loadCompanionVirtualFolderResultIds(snapshot, nodeId, db);
  const matches = await db.query<{ id: string }>(DIVE_CONVERSION_MATCHES_SQL, [JSON.stringify(ids), VIRTUAL_ROOT_NODE_ID]);
  return stringifyManualChildOrder(matches.map(row => row.id));
}
