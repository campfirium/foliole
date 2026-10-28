import { loadWorkspaceListSnapshot as loadWorkspaceListSnapshotViaDriver } from '../../lib/core/database/workspaceListSnapshot.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { openDatabaseConnection } from './connection.js';
import { projectWorkspaceListRendererNode } from './workspaceListRendererNodes.js';

export function loadWorkspaceListSnapshot(options?: { includePdfOpenings?: boolean }) {
  const snapshot = loadWorkspaceListSnapshotViaDriver(openDatabaseConnection().driver, options) ?? {
    activeNodeId: null, capturedWorkspaceVersion: new Date().toISOString(), nodeOrder: [], nodesById: {},
    trashedNodeDeletedAtById: {}, trashedNodeIds: [], untitledSequenceByParent: {}
  };
  const libraryScope = currentLibraryScope();
  return {
    ...snapshot,
    libraryScope,
    nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
      [id, projectWorkspaceListRendererNode(node, libraryScope)]))
  };
}
