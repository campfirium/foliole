import {
  loadWorkspaceSnapshot as loadWorkspaceSnapshotViaDriver,
  type WorkspaceSnapshot
} from '../../lib/core/database/workspaceSnapshot.js';

import { openDatabaseConnection } from './connection.js';

export type { WorkspaceSnapshot };

export function loadWorkspaceSnapshot(): WorkspaceSnapshot | null {
  return loadWorkspaceSnapshotViaDriver(openDatabaseConnection().driver);
}
