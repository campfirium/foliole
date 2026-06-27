import type { RuntimeNodeContentMutationDiagnostics } from '../shared/platform/workspaceRuntimeRepository';

import { readEditorInputDiagnosticTime } from './workspaceEditorInputDiagnostics';
import {
  createUpdateNodeContentMetrics,
  applyRuntimeMutationDiagnostics,
  logUpdateNodeContentDiagnostic,
  type UpdateNodeContentLocalState,
  type UpdateNodeContentMetrics
} from './workspaceNodeContentUpdateDiagnostics';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceNode = WorkspaceState['nodesById'][string];
const NODE_CONTENT_RUNTIME_PERSIST_IDLE_DELAY_MS = 800;

interface PendingNodeContentRuntimePersist {
  args: Parameters<typeof runNodeContentRuntimePersist>[0];
  timer: ReturnType<typeof globalThis.setTimeout>;
}

const pendingNodeContentRuntimePersists = new Map<string, PendingNodeContentRuntimePersist>();

function armNodeContentRuntimePersist(nodeId: string, args: Parameters<typeof runNodeContentRuntimePersist>[0]) {
  const timer = globalThis.setTimeout(() => {
    const pending = pendingNodeContentRuntimePersists.get(nodeId);
    if (!pending || pending.timer !== timer) {
      return;
    }
    pendingNodeContentRuntimePersists.delete(nodeId);
    void runNodeContentRuntimePersist(pending.args);
  }, NODE_CONTENT_RUNTIME_PERSIST_IDLE_DELAY_MS);
  pendingNodeContentRuntimePersists.set(nodeId, { args, timer });
}

export async function applyNodeContentRuntimePatch(args: {
  diagnosticsEnabled: boolean;
  locatorUpdatedNodesForSync: WorkspaceNode[];
  metrics: UpdateNodeContentMetrics;
  nextNodeForSync: WorkspaceNode;
  nodeOrderForSync: string[];
}) {
  const applyStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const mutationStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  const runtimeDiagnostics: RuntimeNodeContentMutationDiagnostics | undefined = args.diagnosticsEnabled ? {} : undefined;
  const result = args.diagnosticsEnabled
    ? await syncNodeContentWithAnchorsMutationToRuntime(
      args.nextNodeForSync,
      args.locatorUpdatedNodesForSync,
      args.nodeOrderForSync,
      true,
      runtimeDiagnostics
    )
    : await syncNodeContentWithAnchorsMutationToRuntime(
      args.nextNodeForSync,
      args.locatorUpdatedNodesForSync,
      args.nodeOrderForSync
    );
  args.metrics.runtimeMutationMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - mutationStartedAt : 0;
  if (args.diagnosticsEnabled) {
    args.metrics.runtimeInvokeMs = runtimeDiagnostics?.invokeMs ?? 0;
    args.metrics.runtimeResultCheckMs = runtimeDiagnostics?.resultCheckMs ?? 0;
    args.metrics.runtimeSnapshotMs = runtimeDiagnostics?.snapshotMs ?? 0;
    applyRuntimeMutationDiagnostics(args.metrics, result);
  }
  args.metrics.runtimeApplyTotalMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - applyStartedAt : 0;
  return Boolean(result) || !hasWorkspaceNodeMutationRuntime();
}

export function applyNodeContentLocalPatch(args: {
  diagnosticsEnabled: boolean;
  localPatch: Partial<WorkspaceState> | null;
  locatorUpdatedNodesForSync: WorkspaceNode[];
  metrics: UpdateNodeContentMetrics;
  nextNodeForSync: WorkspaceNode;
  set: WorkspaceSet;
}) {
  let applied = false;
  const runtimeSetStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
  args.set((state) => {
    const patchBuildStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
    const acceptedPatch = args.localPatch;
    if (args.diagnosticsEnabled) {
      args.metrics.patchBuildMs += readEditorInputDiagnosticTime() - patchBuildStartedAt;
    }
    if (!acceptedPatch) return state;
    applied = true;
    return acceptedPatch;
  });
  args.metrics.runtimeSetMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - runtimeSetStartedAt : 0;
  if (applied) {
    const cacheSyncStartedAt = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0;
    syncWorkspaceNodeDocumentCacheFromNode(args.nextNodeForSync);
    args.locatorUpdatedNodesForSync.forEach(syncWorkspaceNodeDocumentCacheFromNode);
    args.metrics.runtimeCacheSyncMs = args.diagnosticsEnabled ? readEditorInputDiagnosticTime() - cacheSyncStartedAt : 0;
  }
  return applied;
}

async function runNodeContentRuntimePersist(args: {
  contentLength: number;
  diagnosticsEnabled: boolean;
  localState: UpdateNodeContentLocalState;
  metrics: UpdateNodeContentMetrics;
  nextNodeForSync: WorkspaceNode;
}) {
  const runtimeMetrics = args.diagnosticsEnabled ? createUpdateNodeContentMetrics(true) : args.metrics;
  const runtimeAccepted = await applyNodeContentRuntimePatch({
    ...args.localState,
    diagnosticsEnabled: args.diagnosticsEnabled,
    metrics: runtimeMetrics,
    nextNodeForSync: args.nextNodeForSync
  });
  if (args.diagnosticsEnabled) {
    logUpdateNodeContentDiagnostic({
      applied: runtimeAccepted,
      contentLength: args.contentLength,
      event: 'update-node-content-runtime-persist',
      localState: args.localState,
      metrics: runtimeMetrics,
      nodeId: args.nextNodeForSync.id
    });
  }
  return runtimeAccepted;
}

export function scheduleNodeContentRuntimePersist(args: Parameters<typeof runNodeContentRuntimePersist>[0]) {
  const nodeId = args.nextNodeForSync.id;
  const previous = pendingNodeContentRuntimePersists.get(nodeId);
  if (previous) {
    globalThis.clearTimeout(previous.timer);
  }
  armNodeContentRuntimePersist(nodeId, args);
}

export function deferNodeContentRuntimePersist(nodeId: string) {
  const previous = pendingNodeContentRuntimePersists.get(nodeId);
  if (!previous) {
    return;
  }
  globalThis.clearTimeout(previous.timer);
  armNodeContentRuntimePersist(nodeId, previous.args);
}

export async function drainPendingNodeContentRuntimePersists() {
  const pending = [...pendingNodeContentRuntimePersists.values()];
  pendingNodeContentRuntimePersists.clear();
  const results = await Promise.all(pending.map((entry) => {
    globalThis.clearTimeout(entry.timer);
    return runNodeContentRuntimePersist(entry.args);
  }));
  return results.every(Boolean);
}
