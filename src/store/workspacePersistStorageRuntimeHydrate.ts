import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { logRuntimeError, logRuntimeWarning } from '../shared/platform/runtimeLogging';
import {
  hasWorkspaceRuntimeRepository,
  loadReadingProgressFromRuntime,
  loadWorkspaceListSnapshotFromRuntime,
  loadWorkspaceNodeDocumentFromRuntime,
  replayPendingWorkspaceNodeSync
} from '../shared/platform/workspaceRuntimeRepository';

import { listPendingNodeSyncNodeIds, mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import {
  appendWorkspaceHydrateCompletedLog,
  appendWorkspaceHydrateFailedLog,
  appendWorkspaceHydrateStartedLog
} from './workspacePersistStorageHydrateLogging';
import { syncHydratedTextAnchorChildrenForActiveNode } from './workspacePersistStorageTextAnchorHydrate';
import { mergeWorkspaceSnapshotWithReadingProgress } from './workspaceReadingProgress';
import {
  isNodeDocumentLoaded,
  mergeWorkspaceNodeDocument,
  trimWorkspaceNodesForRendererBoundary
} from './workspaceRendererBoundary';

function toPersistedStatePayload(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return JSON.stringify({ state: value, version: 0 });
}

async function loadReadingProgressForHydrate(name: string) {
  const startedAt = Date.now();
  return loadReadingProgressFromRuntime().then((result) => {
    appendReadingPositionTraceLog({
      event: 'reading-progress.hydrate-load',
      payload: {
        activeNodeId: result?.activeNodeId ?? null,
        durationMs: Date.now() - startedAt,
        nodeViewStateCount:
          result && typeof result === 'object' && result.nodeViewStateById && typeof result.nodeViewStateById === 'object'
            ? Object.keys(result.nodeViewStateById).length
            : 0,
        storageKey: name
      },
      timestamp: Date.now()
    });
    return result;
  }).catch((error) => {
    logRuntimeWarning('reading progress load failed during workspace hydrate', {
      area: 'persistence',
      action: 'hydrate_workspace_state',
      fallback: 'merge_snapshot_without_reading_progress',
      storageKey: name,
      error
    });
    return null;
  });
}

type RuntimeWorkspaceSnapshotLike = {
  activeNodeId: string | null;
  nodeOrder: unknown;
  nodesById: Record<string, Node>;
};

type RuntimeWorkspaceSnapshotInput = Omit<RuntimeWorkspaceSnapshotLike, 'nodesById'> & {
  nodesById: Record<string, unknown>;
};

async function hydrateActiveNodeDocument(name: string, snapshot: RuntimeWorkspaceSnapshotLike) {
  const activeNodeId = snapshot.activeNodeId;
  if (!hasWorkspaceRuntimeRepository() || typeof activeNodeId !== 'string') {
    return snapshot;
  }

  const activeNode = snapshot.nodesById[activeNodeId];
  if (!activeNode || isNodeDocumentLoaded(activeNode)) {
    return snapshot;
  }

  const startedAt = Date.now();
  const activeDocument = await loadWorkspaceNodeDocumentFromRuntime(activeNodeId).catch((error) => {
    logRuntimeWarning('active node document load failed during workspace hydrate', {
      area: 'persistence',
      action: 'hydrate_active_node_document',
      fallback: 'keep_lightweight_node',
      storageKey: name,
      nodeId: activeNodeId,
      error
    });
    return null;
  });

  if (!activeDocument || !snapshot.nodesById || typeof snapshot.nodesById !== 'object') {
    return snapshot;
  }

  const mergedActiveNode = mergeWorkspaceNodeDocument(activeNode, activeDocument);
  appendReadingPositionTraceLog({
    event: 'workspace.hydrate-active-document',
    payload: {
      durationMs: Date.now() - startedAt,
      nodeId: activeNodeId,
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
      [activeNodeId]: mergedActiveNode
    },
    timestamp
  });

  return {
    ...snapshot,
    nodesById: syncedNodesById
  };
}

function trimRuntimeWorkspaceSnapshot(snapshot: RuntimeWorkspaceSnapshotInput | null) {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    nodesById: trimWorkspaceNodesForRendererBoundary(
      snapshot.activeNodeId,
      snapshot.nodesById as Record<string, Node>,
      new Set(listPendingNodeSyncNodeIds())
    )
  };
}

function countSnapshotNodeViewStates(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object' || !('nodeViewById' in snapshot)) {
    return 0;
  }
  const nodeViewById = (snapshot as { nodeViewById?: unknown }).nodeViewById;
  if (!nodeViewById || typeof nodeViewById !== 'object') {
    return 0;
  }
  return Object.keys(nodeViewById as Record<string, unknown>).length;
}

function replayPendingNodeSyncAfterHydrate(name: string) {
  void replayPendingWorkspaceNodeSync().catch((error) => {
    logRuntimeWarning('pending node sync replay failed during workspace hydrate', {
      area: 'persistence',
      action: 'replay_pending_node_sync',
      fallback: 'keep_pending_snapshot',
      storageKey: name,
      error
    });
  });
}

async function loadRuntimeWorkspaceState(name: string) {
  if (!hasWorkspaceRuntimeRepository()) {
    return null;
  }

  const snapshotStartedAt = Date.now();
  const [snapshot, readingProgress] = await Promise.all([
    loadWorkspaceListSnapshotFromRuntime({
      includePdfOpenings: false
    }),
    loadReadingProgressForHydrate(name)
  ]);
  const normalizedSnapshot = snapshot
    ? ensureInboxNodeInSnapshot(normalizeWorkspaceSnapshot(mergePendingNodeSyncIntoSnapshot(snapshot) ?? snapshot))
    : null;
  const mergedSnapshot = trimRuntimeWorkspaceSnapshot(
    mergeWorkspaceSnapshotWithReadingProgress(normalizedSnapshot, readingProgress)
  );
  appendReadingPositionTraceLog({
    event: 'reading-progress.hydrate-merge',
    payload: {
      durationMs: Date.now() - snapshotStartedAt,
      runtimeActiveNodeId: snapshot?.activeNodeId ?? null,
      readingActiveNodeId:
        readingProgress && typeof readingProgress === 'object' && 'activeNodeId' in readingProgress
          ? (readingProgress as { activeNodeId?: string | null }).activeNodeId ?? null
          : null,
      mergedActiveNodeId: mergedSnapshot?.activeNodeId ?? null,
      nodeViewStateCount: countSnapshotNodeViewStates(mergedSnapshot),
      storageKey: name
    },
    timestamp: Date.now()
  });
  if (!mergedSnapshot) {
    return null;
  }
  return hydrateActiveNodeDocument(name, mergedSnapshot);
}

export async function getRuntimeWorkspaceState(name: string) {
  const startedAt = Date.now();
  appendWorkspaceHydrateStartedLog(name);

  try {
    const mergedSnapshot = await loadRuntimeWorkspaceState(name);
    replayPendingNodeSyncAfterHydrate(name);
    appendWorkspaceHydrateCompletedLog(name, startedAt, mergedSnapshot);
    return toPersistedStatePayload(mergedSnapshot);
  } catch (error) {
    appendWorkspaceHydrateFailedLog(name, startedAt, error);
    logRuntimeError('workspace hydrate failed', {
      area: 'persistence',
      action: 'hydrate_workspace_state',
      fallback: 'return_null',
      storageKey: name,
      error
    });
    return null;
  }
}
