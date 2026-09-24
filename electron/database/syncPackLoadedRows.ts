import type {
  SyncPackNodeVersionParentRow,
  SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import type { SyncPackGroupDeviceRow, SyncPackGroupRow } from './syncPackGroupRows.js';
import type { LoadedSyncPackRows } from './syncPackRows.js';
import type { SyncPackTombstoneRow } from './syncPackTombstoneRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  groupDevices: SyncPackGroupDeviceRow[];
  groups: SyncPackGroupRow[];
  nodeVersions: SyncPackNodeVersionRow[];
  nodeTombstones: SyncPackTombstoneRow[];
  nodeVersionParents: SyncPackNodeVersionParentRow[];
}
