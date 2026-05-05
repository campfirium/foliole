import type { StateStorage } from 'zustand/middleware';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands';
import type { Node } from '../features/nodes/model/nodeTypes';
import { appendReadingPositionTraceLog } from '../shared/platform/bridge';
import { getRuntimeInvoke } from '../shared/platform/bridge';
import { logRuntimeError, logRuntimeWarning } from '../shared/platform/runtimeLogging';

import {
  listPendingNodeSyncNodeIds,
  mergePendingNodeSyncIntoSnapshot,
  replayPendingNodeSync
} from './workspacePendingNodeSync';
import {
  readFallbackWorkspaceState,
  removeFallbackWorkspaceState,
  writeFallbackWorkspaceState
} from './workspacePersistStorageFallback';
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
  return getRuntimeInvoke()?.(NATIVE_COMMANDS.loadReadingProgress).then((result) => {
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
      command: NATIVE_COMMANDS.loadReadingProgress,
      fallback: 'merge_snapshot_without_reading_progress',
      storageKey: name,
      error
    });
    return null;
  });
}

async function hydrateActiveNodeDocument(name: string, snapshot: Record<string, unknown>) {
  const runtimeInvoke = getRuntimeInvoke();
  const activeNodeId = snapshot.activeNodeId;
  if (!runtimeInvoke || typeof activeNodeId !== 'string') {
    return snapshot;
  }

  const activeNode = snapshot.nodesById && typeof snapshot.nodesById === 'object'
    ? (snapshot.nodesById as Record<string, Node | undefined>)[activeNodeId]
    : undefined;
  if (!activeNode || isNodeDocumentLoaded(activeNode)) {
    return snapshot;
  }

  const startedAt = Date.now();
  const activeDocument = await runtimeInvoke(NATIVE_COMMANDS.loadNodeDocument, { nodeId: activeNodeId }).catch((error) => {
    logRuntimeWarning('active node document load failed during workspace hydrate', {
      area: 'persistence',
      action: 'hydrate_active_node_document',
      command: NATIVE_COMMANDS.loadNodeDocument,
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
      ...(snapshot.nodesById as Record<string, Node | undefined>),
      [activeNodeId]: mergedActiveNode
    } as Record<string, Node>,
    timestamp
  });

  return {
    ...snapshot,
    nodesById: syncedNodesById
  };
}

type RuntimeWorkspaceSnapshotLike = {
  activeNodeId: string | null;
  nodesById: Record<string, unknown>;
};

function trimRuntimeWorkspaceSnapshot(snapshot: RuntimeWorkspaceSnapshotLike | null) {
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

function replayPendingNodeSyncAfterHydrate(name: string, runtimeInvoke: NonNullable<ReturnType<typeof getRuntimeInvoke>>) {
  void replayPendingNodeSync(runtimeInvoke).catch((error) => {
    logRuntimeWarning('pending node sync replay failed during workspace hydrate', {
      area: 'persistence',
      action: 'replay_pending_node_sync',
      command: NATIVE_COMMANDS.updateNodeContent,
      fallback: 'keep_pending_snapshot',
      storageKey: name,
      error
    });
  });
}

async function loadRuntimeWorkspaceState(name: string) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  const snapshotStartedAt = Date.now();
  const [snapshot, readingProgress] = await Promise.all([
    runtimeInvoke(NATIVE_COMMANDS.loadWorkspaceListSnapshot, {
      includePdfOpenings: false
    }),
    loadReadingProgressForHydrate(name)
  ]);
  const mergedSnapshot = trimRuntimeWorkspaceSnapshot(
    mergeWorkspaceSnapshotWithReadingProgress(mergePendingNodeSyncIntoSnapshot(snapshot), readingProgress)
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
  return hydrateActiveNodeDocument(name, mergedSnapshot as unknown as Record<string, unknown>);
}

async function getRuntimeWorkspaceState(name: string, runtimeInvoke: NonNullable<ReturnType<typeof getRuntimeInvoke>>) {
  const startedAt = Date.now();
  appendWorkspaceHydrateStartedLog(name);

  try {
    const mergedSnapshot = await loadRuntimeWorkspaceState(name);
    replayPendingNodeSyncAfterHydrate(name, runtimeInvoke);
    appendWorkspaceHydrateCompletedLog(name, startedAt, mergedSnapshot);
    return toPersistedStatePayload(mergedSnapshot);
  } catch (error) {
    appendWorkspaceHydrateFailedLog(name, startedAt, error);
    logRuntimeError('workspace hydrate failed', {
      area: 'persistence',
      action: 'hydrate_workspace_state',
      command: NATIVE_COMMANDS.loadWorkspaceListSnapshot,
      relatedCommand: NATIVE_COMMANDS.loadReadingProgress,
      fallback: 'return_null',
      storageKey: name,
      error
    });
    return null;
  }
}

export const workspacePersistStorage: StateStorage = {
  async getItem(name) {
    const runtimeInvoke = getRuntimeInvoke();
    if (runtimeInvoke) {
      return getRuntimeWorkspaceState(name, runtimeInvoke);
    }
    return readFallbackWorkspaceState(name);
  },
  setItem(name, value) {
    if (getRuntimeInvoke()) {
      return;
    }
    writeFallbackWorkspaceState(name, value);
  },
  removeItem(name) {
    if (getRuntimeInvoke()) {
      return;
    }
    removeFallbackWorkspaceState(name);
  }
};
