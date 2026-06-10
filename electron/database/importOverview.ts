import { loadImportOverview as loadImportOverviewViaDriver } from '../../lib/core/database/importOverview.js';

import { openDatabaseConnection } from './connection.js';

export function loadImportOverview(limit?: number) {
  return loadImportOverviewViaDriver(openDatabaseConnection().driver, limit);
}
