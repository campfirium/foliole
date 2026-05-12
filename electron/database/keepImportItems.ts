import {
  listPresentKeepImportItems as listPresentKeepImportItemsViaDriver,
  listRemovedKeepImportItems as listRemovedKeepImportItemsViaDriver,
  markKeepImportItemsLocallyDeletedByNodeIds as markKeepImportItemsLocallyDeletedByNodeIdsViaDriver,
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

export function listPresentKeepImportItems() {
  return listPresentKeepImportItemsViaDriver(openDatabaseConnection().driver);
}

export function listRemovedKeepImportItems() {
  return listRemovedKeepImportItemsViaDriver(openDatabaseConnection().driver);
}

export function markKeepImportItemsLocallyDeletedByNodeIds(nodeIds: string[], deletedAt: string) {
  return markKeepImportItemsLocallyDeletedByNodeIdsViaDriver(openDatabaseConnection().driver, nodeIds, deletedAt);
}

export function markMissingKeepImportItems(ruleId: string, presentSourcePaths: string[]) {
  return markMissingKeepImportItemsViaDriver(openDatabaseConnection().driver, ruleId, presentSourcePaths);
}

export function upsertKeepImportItem(input: UpsertKeepImportItemInput) {
  return upsertKeepImportItemViaDriver(openDatabaseConnection().driver, input);
}
