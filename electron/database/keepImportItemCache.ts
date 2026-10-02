import {
  readKeepImportItemCache as readKeepImportItemCacheViaDriver,
  upsertKeepImportItemCache as upsertKeepImportItemCacheViaDriver,
  type UpsertKeepImportItemCacheInput
} from '../../lib/core/database/keepImportItemCache.js';

import { openDatabaseConnection } from './connection.js';
import { readKeepImportItem } from './keepImportItems.js';

export function readKeepImportItemCache(ruleId: string, sourcePath: string) {
  return readKeepImportItemCacheViaDriver(openDatabaseConnection().driver, ruleId, sourcePath);
}

export function upsertKeepImportItemCache(input: UpsertKeepImportItemCacheInput, options: { requireTracking?: boolean } = {}) {
  const connection = openDatabaseConnection();
  if (!options.requireTracking) {
    return upsertKeepImportItemCacheViaDriver(connection.driver, input);
  }
  connection.sqlite.transaction(() => {
    if (!readKeepImportItem(input.ruleId, input.sourcePath)) return;
    upsertKeepImportItemCacheViaDriver(connection.driver, input);
  })();
}
