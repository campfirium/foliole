import type { SyncPackNodeVersionRow } from '../../lib/core/sync/syncPackNodeVersions.js';

import type { LoadedSyncPackRows } from './syncPackRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  nodeVersions: SyncPackNodeVersionRow[];
}
