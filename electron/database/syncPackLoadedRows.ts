import type {
  SyncPackNodeVersionParentRow,
  SyncPackNodeVersionRow
} from '../../lib/core/sync/syncPackNodeVersions.js';

import type { SyncPackGroupDepartureRow, SyncPackGroupMemberRow, SyncPackGroupRow } from './syncPackGroupRows.js';
import type { LoadedSyncPackRows } from './syncPackRows.js';

export interface LoadedDesktopSyncPackRows extends LoadedSyncPackRows {
  groupDepartures: SyncPackGroupDepartureRow[];
  groupMembers: SyncPackGroupMemberRow[];
  groups: SyncPackGroupRow[];
  nodeVersions: SyncPackNodeVersionRow[];
  nodeVersionParents: SyncPackNodeVersionParentRow[];
}
