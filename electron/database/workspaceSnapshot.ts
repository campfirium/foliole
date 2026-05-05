import {
  loadWorkspaceSnapshot as loadWorkspaceSnapshotViaDriver,
  type WorkspaceSnapshot
} from '../../lib/core/database/workspaceSnapshot.js';

import { openDatabaseConnection } from './connection.js';

export type { WorkspaceSnapshot };

export interface WorkspaceVersionMetadata {
  hasSnapshot: boolean;
  workspaceVersion: string | null;
}

export function loadWorkspaceSnapshot(): WorkspaceSnapshot | null {
  return loadWorkspaceSnapshotViaDriver(openDatabaseConnection().driver);
}

export function loadWorkspaceVersionMetadata(): WorkspaceVersionMetadata {
  const row = openDatabaseConnection().driver.queryOne<{ workspace_version: string | null }>(
    'SELECT MAX(updated_at) AS workspace_version FROM nodes',
    []
  );
  const workspaceVersion = row?.workspace_version ?? null;
  return {
    hasSnapshot: workspaceVersion !== null,
    workspaceVersion
  };
}
