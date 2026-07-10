import { normalizeWorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshotContract';
import type { Node } from '../features/nodes/model/nodeTypes';
import { ensureInboxNodeInSnapshot } from '../features/nodes/model/specialNodes';
import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { logRuntimeError, logRuntimeWarning } from '../shared/platform/runtimeLogging';
import {
  hasWorkspaceRuntimeRepository,
  loadReadingProgressFromRuntime,
  loadWorkspaceListSnapshotFromRuntime
} from '../shared/platform/workspaceRuntimeRepository';

import { reportWorkspaceHydrateBootStage } from './workspaceHydrateBootTelemetry';
import {
  mergePendingDurableReadingProgress,
  mergePendingDurableWorkspaceSnapshot,
  replayPendingWorkspaceMutations
} from './workspacePendingDurableHydrate';
import { listPendingNodeSyncNodeIds, mergePendingNodeSyncIntoSnapshot } from './workspacePendingNodeSync';
import {
  appendWorkspaceHydrateCompletedLog,
  appendWorkspaceHydrateFailedLog,
  appendWorkspaceHydrateStartedLog
} from './workspacePersistStorageHydrateLogging';
import { hydrateActiveNodeDocument } from './workspacePersistStorageRuntimeActiveDocumentHydrate';
import { mergeWorkspaceSnapshotWithReadingProgress } from './workspaceReadingProgress';
import { trimWorkspaceNodesForRendererBoundary } from './workspaceRendererBoundary';

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
  nodeOrder: string[];
  nodesById: Record<string, Node>;
};


type RuntimeWorkspaceSnapshotInput = Omit<RuntimeWorkspaceSnapshotLike, 'nodesById'> & {
  nodesById: Record<string, unknown>;
  manualVirtualCollections?: unknown;
};

type RuntimeWorkspaceSnapshotForNormalization = RuntimeWorkspaceSnapshotLike & {
  trashedNodeDeletedAtById?: Record<string, string | undefined>;
  manualVirtualCollections?: unknown;
  trashedNodeIds: string[];
};

type RuntimeReadingProgressLike = {
  activeNodeId?: unknown;
};

function toRuntimeWorkspaceSnapshotForNormalization(snapshot: unknown): RuntimeWorkspaceSnapshotForNormalization {
  return snapshot as RuntimeWorkspaceSnapshotForNormalization;
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

function resolveHydrateDocumentNodeId(
  snapshot: RuntimeWorkspaceSnapshotLike & { trashedNodeIds: string[] },
  readingProgress: RuntimeReadingProgressLike | null
) {
  const readingActiveNodeId = readingProgress?.activeNodeId;
  if (
    typeof readingActiveNodeId === 'string' &&
    snapshot.nodesById[readingActiveNodeId] &&
    !snapshot.trashedNodeIds.includes(readingActiveNodeId)
  ) {
    return readingActiveNodeId;
  }
  return snapshot.activeNodeId;
}

function replayPendingNodeSyncAfterHydrate(name: string) {
  void replayPendingWorkspaceMutations().catch((error) => {
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
  reportWorkspaceHydrateBootStage('runtime_load_start');
  const [snapshot, readingProgress] = await Promise.all([
    loadWorkspaceListSnapshotFromRuntime({
      includePdfOpenings: false
    }),
    loadReadingProgressForHydrate(name)
  ]);
  reportWorkspaceHydrateBootStage('runtime_load_complete', {
    durationMs: Date.now() - snapshotStartedAt,
    nodeCount: snapshot ? Object.keys(snapshot.nodesById).length : 0
  });
  const normalizedSnapshot = snapshot
    ? ensureInboxNodeInSnapshot(
        normalizeWorkspaceSnapshot<Node, RuntimeWorkspaceSnapshotForNormalization>(
          toRuntimeWorkspaceSnapshotForNormalization(
            mergePendingDurableWorkspaceSnapshot(mergePendingNodeSyncIntoSnapshot(snapshot) ?? snapshot)
          )
        )
      )
    : null;
  const durableReadingProgress = mergePendingDurableReadingProgress(readingProgress);
  const mergedSnapshot = trimRuntimeWorkspaceSnapshot(
    mergeWorkspaceSnapshotWithReadingProgress(normalizedSnapshot, durableReadingProgress)
  );
  const hydrateDocumentNodeId = normalizedSnapshot
    ? resolveHydrateDocumentNodeId(normalizedSnapshot, durableReadingProgress as RuntimeReadingProgressLike | null)
    : null;
  appendReadingPositionTraceLog({
    event: 'reading-progress.hydrate-merge',
    payload: {
      durationMs: Date.now() - snapshotStartedAt,
      runtimeActiveNodeId: snapshot?.activeNodeId ?? null,
      readingActiveNodeId:
        durableReadingProgress && typeof durableReadingProgress === 'object' && 'activeNodeId' in durableReadingProgress
          ? (durableReadingProgress as { activeNodeId?: string | null }).activeNodeId ?? null
          : null,
      mergedActiveNodeId: mergedSnapshot?.activeNodeId ?? null,
      nodeViewStateCount: countSnapshotNodeViewStates(mergedSnapshot),
      storageKey: name
    },
    timestamp: Date.now()
  });
  reportWorkspaceHydrateBootStage('runtime_merge_complete', {
    durationMs: Date.now() - snapshotStartedAt,
    mergedActiveNodeId: mergedSnapshot?.activeNodeId ?? null,
    nodeViewStateCount: countSnapshotNodeViewStates(mergedSnapshot)
  });
  if (!mergedSnapshot) {
    return null;
  }
  return hydrateActiveNodeDocument(name, mergedSnapshot, hydrateDocumentNodeId);
}

export async function getRuntimeWorkspaceState(name: string) {
  const startedAt = Date.now();
  appendWorkspaceHydrateStartedLog(name);
  reportWorkspaceHydrateBootStage('runtime_start');

  try {
    const mergedSnapshot = await loadRuntimeWorkspaceState(name);
    replayPendingNodeSyncAfterHydrate(name);
    appendWorkspaceHydrateCompletedLog(name, startedAt, mergedSnapshot);
    reportWorkspaceHydrateBootStage('runtime_complete', {
      durationMs: Date.now() - startedAt,
      nodeCount: mergedSnapshot ? Object.keys(mergedSnapshot.nodesById).length : 0
    });
    return toPersistedStatePayload(mergedSnapshot);
  } catch (error) {
    appendWorkspaceHydrateFailedLog(name, startedAt, error);
    reportWorkspaceHydrateBootStage('runtime_failed', {
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
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
