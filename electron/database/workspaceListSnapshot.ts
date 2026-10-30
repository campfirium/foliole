import { loadWorkspaceListSnapshot as loadWorkspaceListSnapshotViaDriver } from '../../lib/core/database/workspaceListSnapshot.js';
import { loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { openDatabaseConnection } from './connection.js';
import { hasDesktopNodeIndex, prepareDesktopNodeIndex, readDesktopNodeIndex } from './desktopNodeIndex.js';
import { projectWorkspaceListRendererNode } from './workspaceListRendererNodes.js';

export function loadWorkspaceListSnapshot(options?: { includePdfOpenings?: boolean }) {
  const { sqlite, driver } = openDatabaseConnection();
  const priority = loadReviewSchedulerSettings().pushQueue.defaultPriority;
  const publish = !sqlite.inTransaction;
  if (publish && hasDesktopNodeIndex(sqlite)) prepareDesktopNodeIndex(sqlite, priority);
  let rawOrder: readonly string[] = [];
  let version = 0;
  let usedIndex = false;
  const value = sqlite.transaction(() => {
    // Pin the main-database snapshot before considering a prepared order.
    sqlite.prepare('SELECT 1 FROM nodes LIMIT 1').get();
    const index = readDesktopNodeIndex(sqlite);
    usedIndex = Boolean(index);
    if (publish && !index) version = sqlite.pragma('data_version', { simple: true }) as number;
    return loadWorkspaceListSnapshotViaDriver(driver, { ...options, onNodeOrder: ids => { rawOrder = ids; },
      ...(index ? { nodeOrder: index.nodeOrder } : {}) });
  })();
  const snapshot = value ?? {
    activeNodeId: null, capturedWorkspaceVersion: new Date().toISOString(), nodeOrder: [], nodesById: {},
    trashedNodeDeletedAtById: {}, trashedNodeIds: [], untitledSequenceByParent: {}
  };
  if (publish && !usedIndex) prepareDesktopNodeIndex(sqlite, priority, { version, order: rawOrder,
    nodes: Object.values(snapshot.nodesById).map(node => ({ ...node, anchorKind: node.anchorLink?.kind ?? null })) });
  const libraryScope = currentLibraryScope();
  return {
    ...snapshot,
    libraryScope,
    nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([id, node]) =>
      [id, projectWorkspaceListRendererNode(node, libraryScope)]))
  };
}
