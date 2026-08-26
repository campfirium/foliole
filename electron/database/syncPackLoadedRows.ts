import type {
  SyncPackNodeVersionParentRow,
  SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import type { SyncPackGroupDeviceRow, SyncPackGroupRow } from './syncPackGroupRows.js';
import type { LoadedSyncPackRows } from './syncPackRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  groupDevices: SyncPackGroupDeviceRow[];
  groups: SyncPackGroupRow[];
  nodeVersions: SyncPackNodeVersionRow[];
  nodeVersionParents: SyncPackNodeVersionParentRow[];
}
