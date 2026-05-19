import {
  listPresentKeepImportItems as listPresentKeepImportItemsViaDriver,
  listRemovedKeepImportItems as listRemovedKeepImportItemsViaDriver,
  markKeepImportItemsLocallyDeletedByNodeDeletedAt as markKeepImportItemsLocallyDeletedByNodeDeletedAtViaDriver,
  markMissingKeepImportItems as markMissingKeepImportItemsViaDriver,
  readKeepImportItem as readKeepImportItemViaDriver,
  readKeepImportNodeState as readKeepImportNodeStateViaDriver,
  upsertKeepImportItem as upsertKeepImportItemViaDriver,
  type KeepImportItemRow,
  type UpsertKeepImportItemInput
} from '../../lib/core/database/keepImportItems.js';

import { openDatabaseConnection } from './connection.js';

export type { KeepImportItemRow, UpsertKeepImportItemInput };

export function readKeepImportItem(ruleId: string, sourcePath: string) {
  return readKeepImportItemViaDriver(openDatabaseConnection().driver, ruleId, sourcePath);
}

export function readKeepImportNodeState(nodeId: string) {
  return readKeepImportNodeStateViaDriver(openDatabaseConnection().driver, nodeId);
}

export function readKeepImportNodeContent(nodeId: string) {
  return (
    openDatabaseConnection().driver.queryOne<{ content: string }>(
      `SELECT content
       FROM nodes
       WHERE id = ? AND deleted_at IS NULL`,
      [nodeId]
    )?.content ?? null
  );
}

export function listPresentKeepImportItems() {
  return listPresentKeepImportItemsViaDriver(openDatabaseConnection().driver);
}

export function listRemovedKeepImportItems() {
  return listRemovedKeepImportItemsViaDriver(openDatabaseConnection().driver);
}

export function markKeepImportItemsLocallyDeletedByNodeDeletedAt(nodeDeletedAt: Array<{ deletedAt: string; nodeId: string }>) {
  return markKeepImportItemsLocallyDeletedByNodeDeletedAtViaDriver(openDatabaseConnection().driver, nodeDeletedAt);
}

export function markMissingKeepImportItems(ruleId: string, presentSourcePaths: string[]) {
  return markMissingKeepImportItemsViaDriver(openDatabaseConnection().driver, ruleId, presentSourcePaths);
}

export function upsertKeepImportItem(input: UpsertKeepImportItemInput) {
  return upsertKeepImportItemViaDriver(openDatabaseConnection().driver, input);
}
