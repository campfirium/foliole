import {
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

export function upsertKeepImportItem(input: UpsertKeepImportItemInput) {
  return upsertKeepImportItemViaDriver(openDatabaseConnection().driver, input);
}
