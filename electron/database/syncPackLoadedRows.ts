import type { NodeVersionDependency } from '../../lib/core/sync/nodeVersionDependencies.js';
import type {
  SyncNodeVersionParentRow,
  SyncNodeVersionRow
} from '../../lib/core/sync/syncNodeVersionRows.js';

import type { SyncPackGroupDeviceRow, SyncPackGroupRow } from './syncPackGroupRows.js';
import type { LoadedSyncPackRows } from './syncPackRows.js';
import type { SyncPackTombstoneRow } from './syncPackTombstoneRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  nodeVersionDependencies?: NodeVersionDependency[];
  groupDevices: SyncPackGroupDeviceRow[];
  groups: SyncPackGroupRow[];
  nodeVersions: SyncNodeVersionRow[];
  nodeTombstones: SyncPackTombstoneRow[];
  nodeVersionParents: SyncNodeVersionParentRow[];
}

export type WritableDesktopSyncPackRows = Omit<LoadedDesktopSyncPackRows, 'consumedStateSeq'>;
