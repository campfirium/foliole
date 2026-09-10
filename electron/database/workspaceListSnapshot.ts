import { loadWorkspaceListSnapshot as loadWorkspaceListSnapshotViaDriver } from '../../lib/core/database/workspaceListSnapshot.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { openDatabaseConnection } from './connection.js';

export function loadWorkspaceListSnapshot(options?: { includePdfOpenings?: boolean }) {
  const snapshot = loadWorkspaceListSnapshotViaDriver(openDatabaseConnection().driver, options);
  if (!snapshot) return null;
  const libraryScope = currentLibraryScope();
  return {
    ...snapshot,
    libraryScope,
    nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) => [id, {
      ...node,
      attachments: node.attachments?.map((attachment) => ({ ...attachment, libraryScope }))
    }]))
  };
}
