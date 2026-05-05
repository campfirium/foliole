import { loadWorkspaceListSnapshot as loadWorkspaceListSnapshotViaDriver } from '../../lib/core/database/workspaceListSnapshot.js';

import { openDatabaseConnection } from './connection.js';

export function loadWorkspaceListSnapshot(options?: { includePdfOpenings?: boolean }) {
  return loadWorkspaceListSnapshotViaDriver(openDatabaseConnection().driver, options);
}
