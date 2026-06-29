import type { Node } from '../features/nodes/model/nodeTypes';
import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { logRuntimeWarning } from '../shared/platform/runtimeLogging';
import {
  hasWorkspaceRuntimeRepository,
  loadWorkspaceNodeDocumentFromRuntime
} from '../shared/platform/workspaceRuntimeRepository';

import { reportWorkspaceHydrateBootStage } from './workspaceHydrateBootTelemetry';
import { syncHydratedTextAnchorChildrenForActiveNode } from './workspacePersistStorageTextAnchorHydrate';
import {
  isNodeDocumentLoaded,
  mergeWorkspaceNodeDocument
} from './workspaceRendererBoundary';

interface RuntimeWorkspaceSnapshotLike {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
}

export async function hydrateActiveNodeDocument(
  name: string,
  snapshot: RuntimeWorkspaceSnapshotLike,
  documentNodeId = snapshot.activeNodeId
) {
  if (!hasWorkspaceRuntimeRepository() || typeof documentNodeId !== 'string') {
    return snapshot;
  }

  const activeNode = snapshot.nodesById[documentNodeId];
  if (!activeNode || isNodeDocumentLoaded(activeNode)) {
    return snapshot;
  }

  const startedAt = Date.now();
  reportWorkspaceHydrateBootStage('active_document_start', {
    nodeId: documentNodeId
  });
  const activeDocument = await loadWorkspaceNodeDocumentFromRuntime(documentNodeId).catch((error) => {
    logRuntimeWarning('active node document load failed during workspace hydrate', {
      area: 'persistence',
      action: 'hydrate_active_node_document',
      fallback: 'keep_lightweight_node',
      storageKey: name,
      nodeId: documentNodeId,
      error
    });
    return null;
  });

  if (!activeDocument || !snapshot.nodesById || typeof snapshot.nodesById !== 'object') {
    return snapshot;
  }

  reportWorkspaceHydrateBootStage('active_document_complete', {
    durationMs: Date.now() - startedAt,
    nodeId: documentNodeId
  });
  const mergedActiveNode = mergeWorkspaceNodeDocument(activeNode, activeDocument);
  appendReadingPositionTraceLog({
    event: 'workspace.hydrate-active-document',
    payload: {
      durationMs: Date.now() - startedAt,
      nodeId: documentNodeId,
      storageKey: name
    },
    timestamp: Date.now()
  });
  const timestamp = new Date().toISOString();
  const syncedNodesById = syncHydratedTextAnchorChildrenForActiveNode({
    activeNode: mergedActiveNode,
    nodeOrder: snapshot.nodeOrder,
    nodesById: {
      ...snapshot.nodesById,
      [documentNodeId]: mergedActiveNode
    },
    timestamp
  });

  return {
    ...snapshot,
    nodesById: syncedNodesById
  };
}
