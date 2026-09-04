import {
  listRemovedKeepImportItems as listRemovedKeepImportItemsViaDriver,
  markKeepImportItemsLocallyDeletedByNodeDeletedAt as markKeepImportItemsLocallyDeletedByNodeDeletedAtViaDriver,
  markMissingKeepImportItems as markMissingKeepImportItemsViaDriver,
  readKeepImportItem as readKeepImportItemViaDriver,
  readKeepImportNodeState as readKeepImportNodeStateViaDriver,
  upsertKeepImportItem as upsertKeepImportItemViaDriver,
  type KeepImportItemRow,
  type UpsertKeepImportItemInput
} from '../../lib/core/database/keepImportItems.js';
import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';

import { openDatabaseConnection } from './connection.js';

export type { KeepImportItemRow, UpsertKeepImportItemInput };

export function readKeepImportItem(ruleId: string, sourcePath: string) {
  return readKeepImportItemViaDriver(openDatabaseConnection().driver, ruleId, sourcePath);
}

export function countPresentKeepImportItems(ruleId: string) {
  return (
    openDatabaseConnection().driver.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM keep_import_items
       WHERE rule_id = ? AND source_state = 'present'`,
      [ruleId]
    )?.count ?? 0
  );
}

export function readKeepImportNodeState(nodeId: string) {
  return readKeepImportNodeStateViaDriver(openDatabaseConnection().driver, nodeId);
}

export function readKeepImportNodeContent(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<NodeBodyRow & { id: string }>(
      `SELECT n.id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ? AND n.deleted_at IS NULL`,
      [nodeId]
  );
  return row ? requireResolvedNodeBody(row, row.id).content : null;
}

export function listRemovedKeepImportItems() {
  return listRemovedKeepImportItemsViaDriver(openDatabaseConnection().driver);
}

export function markKeepImportItemsLocallyDeletedByNodeDeletedAt(nodeDeletedAt: Array<{ deletedAt: string; nodeId: string }>) {
  const driver = openDatabaseConnection().driver;
  markKeepImportItemsLocallyDeletedByNodeDeletedAtViaDriver(driver, nodeDeletedAt);
  markKeepImportItemsLocallyDeletedByImportedSource(driver, nodeDeletedAt);
}

function markKeepImportItemsLocallyDeletedByImportedSource(
  driver: ReturnType<typeof openDatabaseConnection>['driver'],
  nodeDeletedAt: Array<{ deletedAt: string; nodeId: string }>
) {
  if (nodeDeletedAt.length === 0) {
    return;
  }
  const deletedAtByNodeId = new Map(nodeDeletedAt.map((row) => [row.nodeId, row.deletedAt]));
  const placeholders = nodeDeletedAt.map(() => '?').join(', ');
  const sourceRows = driver.queryAll<{ node_id: string; source_fingerprint: string; source_name: string }>(
    `SELECT DISTINCT node_id, source_fingerprint, source_name
     FROM import_runs
     WHERE node_id IN (${placeholders})`,
    nodeDeletedAt.map((row) => row.nodeId)
  );
  for (const row of sourceRows) {
    driver.execute(
      `UPDATE keep_import_items
       SET local_node_state = 'locally_deleted',
           last_status = 'blocked_deleted',
           deleted_at = COALESCE(deleted_at, ?)
       WHERE source_state = 'present'
         AND source_path = ?`,
      [deletedAtByNodeId.get(row.node_id) ?? new Date().toISOString(), row.source_name]
    );
  }
}

export function markMissingKeepImportItems(ruleId: string, presentSourcePaths: string[]) {
  return markMissingKeepImportItemsViaDriver(openDatabaseConnection().driver, ruleId, presentSourcePaths);
}

export function upsertKeepImportItem(input: UpsertKeepImportItemInput) {
  return upsertKeepImportItemViaDriver(openDatabaseConnection().driver, input);
}
