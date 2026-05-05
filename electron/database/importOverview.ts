import { loadImportOverview as loadImportOverviewViaDriver, type ImportOverview } from '../../lib/core/database/importOverview.js';

import { openDatabaseConnection } from './connection.js';

export type { ImportOverview };

export function loadImportOverview(limit?: number) {
  return loadImportOverviewViaDriver(openDatabaseConnection().driver, limit);
}
