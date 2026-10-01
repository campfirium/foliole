import type { NodeVersionDependency } from '../../lib/core/sync/nodeVersionDependencies.js';
import type {
  SyncPackNodeVersionParentRow,
  SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import type { SyncPackGroupDeviceRow, SyncPackGroupRow } from './syncPackGroupRows.js';
import type { LoadedSyncPackRows } from './syncPackRows.js';
import type { SyncPackTombstoneRow } from './syncPackTombstoneRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  nodeVersionDependencies?: NodeVersionDependency[];
  groupDevices: SyncPackGroupDeviceRow[];
  groups: SyncPackGroupRow[];
  nodeVersions: SyncPackNodeVersionRow[];
  nodeTombstones: SyncPackTombstoneRow[];
  nodeVersionParents: SyncPackNodeVersionParentRow[];
}
