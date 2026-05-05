import { loadWorkspaceListSnapshot as loadWorkspaceListSnapshotViaDriver } from '../../lib/core/database/workspaceListSnapshot.js';

import { openDatabaseConnection } from './connection.js';

export function loadWorkspaceListSnapshot() {
  return loadWorkspaceListSnapshotViaDriver(openDatabaseConnection().driver);
}
