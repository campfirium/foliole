import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { VISIBLE_NODES_CTE_SQL } from '../../../../../lib/core/database/workspaceVisibleNodesSql';
import { isManualVirtualNodeFilter } from '../../../../../lib/core/nodes/virtualNodeFilter';
import { applyVirtualNodeManualOrder } from '../../../../../lib/core/nodes/virtualNodeResults';

import { readIosCompanionDatabase } from './iosCompanionActiveDatabase';

export async function loadCompanionVirtualFolderResultIds(snapshot: WorkspaceSnapshot, folderNodeId: string) {
  const folder = snapshot.nodesById[folderNodeId];
  const filter = folder?.virtualFilter;
  if (!folder || !filter) return [];
  if (isManualVirtualNodeFilter(filter)) {
    return (folder.manualChildOrder ?? []).filter((nodeId) => isVirtualResultCandidate(snapshot, folderNodeId, nodeId));
  }
  const conditions = filter.conditions
    .map((condition) => ({ ...condition, value: condition.value.trim() }))
    .filter((condition) => condition.value.length > 0);
  if (conditions.length === 0) return [];
  const textValues = conditions.filter((condition) => condition.field === 'text').map((condition) => condition.value);
  const textCandidateIds = textValues.length > 0
    ? new Set(await queryTextCandidateIds(folderNodeId, textValues))
    : null;
  const candidateIds = snapshot.nodeOrder.filter((nodeId) => !textCandidateIds || textCandidateIds.has(nodeId));
  const collectionValues = conditions
    .filter((condition) => condition.field === 'collection')
    .map((condition) => condition.value);
  const matchedIds = candidateIds.filter((nodeId) => {
    const node = snapshot.nodesById[nodeId];
    return isVirtualResultCandidate(snapshot, folderNodeId, nodeId) &&
      collectionValues.every((value) => node?.collections?.includes(value));
  });
  return applyVirtualNodeManualOrder(matchedIds, folder.manualChildOrder);
}

function isVirtualResultCandidate(snapshot: WorkspaceSnapshot, folderNodeId: string, nodeId: string) {
  const node = snapshot.nodesById[nodeId];
  return Boolean(node && nodeId !== folderNodeId && node.kind !== 'folder' && !node.anchorLink);
}

function queryTextCandidateIds(folderNodeId: string, values: string[]) {
  const body = "lower(n.title || char(10) || COALESCE(CAST(cbd.data AS TEXT), n.content, ''))";
  const conditions = values.map(() => `instr(${body}, ?) > 0`).join(' AND ');
  return readIosCompanionDatabase(async (db) => {
    const rows = await db.query<{ id: string }>(
      `${VISIBLE_NODES_CTE_SQL}
       SELECT n.id FROM nodes n
       INNER JOIN visible_nodes visible ON visible.id = n.id
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id <> ? AND n.kind <> 'folder' AND n.anchor_link IS NULL AND ${conditions}`,
      [folderNodeId, ...values.map((value) => value.toLocaleLowerCase())]
    );
    return rows.map((row) => row.id);
  });
}
