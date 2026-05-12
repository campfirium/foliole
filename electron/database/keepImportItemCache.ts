import {
  readKeepImportItemCache as readKeepImportItemCacheViaDriver,
  upsertKeepImportItemCache as upsertKeepImportItemCacheViaDriver,
  type UpsertKeepImportItemCacheInput
} from '../../lib/core/database/keepImportItemCache.js';

import { openDatabaseConnection } from './connection.js';

export function readKeepImportItemCache(ruleId: string, sourcePath: string) {
  return readKeepImportItemCacheViaDriver(openDatabaseConnection().driver, ruleId, sourcePath);
}

export function upsertKeepImportItemCache(input: UpsertKeepImportItemCacheInput) {
  return upsertKeepImportItemCacheViaDriver(openDatabaseConnection().driver, input);
}
