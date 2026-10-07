import {
  readKeepImportItemCache as readKeepImportItemCacheViaDriver,
  upsertKeepImportItemCache as upsertKeepImportItemCacheViaDriver,
  type UpsertKeepImportItemCacheInput
} from '../../lib/core/database/keepImportItemCache.js';
import { requestSearchIndexInvalidationProcessing } from '../../lib/core/database/searchIndexInvalidationRuntime.js';

import { openDatabaseConnection } from './connection.js';
import { readKeepImportItem } from './keepImportItems.js';

export function readKeepImportItemCache(ruleId: string, sourcePath: string) {
  return readKeepImportItemCacheViaDriver(openDatabaseConnection().driver, ruleId, sourcePath);
}

export function upsertKeepImportItemCache(input: UpsertKeepImportItemCacheInput, options: { requireTracking?: boolean } = {}) {
  const connection = openDatabaseConnection();
  if (!options.requireTracking) {
    upsertKeepImportItemCacheViaDriver(connection.driver, input);
    requestSearchIndexInvalidationProcessing();
    return;
  }
  const written = connection.sqlite.transaction(() => {
    if (!readKeepImportItem(input.ruleId, input.sourcePath)) return false;
    upsertKeepImportItemCacheViaDriver(connection.driver, input);
    return true;
  })();
  if (written) requestSearchIndexInvalidationProcessing();
}
