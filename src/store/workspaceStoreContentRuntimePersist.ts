import type { LocalContentEdit } from '../../lib/core/sync/localContentEdit';
import type { RuntimeNodeContentMutationDiagnostics } from '../shared/platform/workspaceRuntimeRepository';

import { createNodeContentPersistQueue } from './nodeContentPersistQueue';
import { acknowledgeContentEdit, captureContentEdit, continueContentEdit, resetContentEditAcknowledgementsForTests } from './workspaceContentEditAcknowledgements';
import { readEditorInputDiagnosticTime } from './workspaceEditorInputDiagnostics';
import {
  createUpdateNodeContentMetrics,
  applyRuntimeMutationDiagnostics,
  logUpdateNodeContentDiagnostic,
  type UpdateNodeContentLocalState,
  type UpdateNodeContentMetrics
} from './workspaceNodeContentUpdateDiagnostics';
import {
  isNodeCreatePending,
  markNodeCreateConfirmed,
  markNodeContentPersisted,
  waitForNodeCreateConfirmations
} from './workspaceNodeContentVersionGuard';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { applyRuntimeAnchorAcknowledgements } from './workspaceRuntimeAnchorAcknowledgements';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentWithAnchorsMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type WorkspaceNode = WorkspaceState['nodesById'][string];
const NODE_CONTENT_RUNTIME_PERSIST_IDLE_DELAY_MS = 800;

const contentPersistQueue = createNodeContentPersistQueue({
  delayMs: NODE_CONTENT_RUNTIME_PERSIST_IDLE_DELAY_MS,
  isBlocked: isNodeCreatePending,
  persist: runNodeContentRuntimePersist
});

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
  return result;
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
  edit?: LocalContentEdit | undefined;
  contentLength: number;
  diagnosticsEnabled: boolean;
  localState: UpdateNodeContentLocalState;
  metrics: UpdateNodeContentMetrics;
  nextNodeForSync: WorkspaceNode;
  set: WorkspaceSet;
  version: number;
}) {
  if (!args.edit) args.edit = captureContentEdit(args.nextNodeForSync);
  continueContentEdit(args.nextNodeForSync.id, args.edit);
  const runtimeMetrics = args.diagnosticsEnabled ? createUpdateNodeContentMetrics(true) : args.metrics;
  const runtimeResult = await applyNodeContentRuntimePatch({
    ...args.localState,
    diagnosticsEnabled: args.diagnosticsEnabled,
    metrics: runtimeMetrics,
    nextNodeForSync: Object.assign({}, args.nextNodeForSync, args.edit ? { contentEdit: args.edit } : {})
  });
  const runtimeAccepted = Boolean(runtimeResult) || !hasWorkspaceNodeMutationRuntime();
  applyRuntimeAnchorAcknowledgements(args.set, runtimeResult);
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
  if (runtimeAccepted) {
    acknowledgeContentEdit({ ...args, edit: args.edit, node: args.nextNodeForSync, result: runtimeResult });
    markNodeContentPersisted(args.nextNodeForSync.id, args.version);
  }
  return runtimeAccepted;
}

export function scheduleNodeContentRuntimePersist(args: Parameters<typeof runNodeContentRuntimePersist>[0]) {
  syncWorkspaceNodeDocumentCacheFromNode(args.nextNodeForSync);
  contentPersistQueue.schedule(args.nextNodeForSync.id, { ...args, edit: captureContentEdit(args.nextNodeForSync) });
}

export const deferNodeContentRuntimePersist = contentPersistQueue.defer;
export const drainPendingNodeContentRuntimePersist = contentPersistQueue.drain;

export async function completeNodeCreateRuntimePersist(nodeId: string) {
  markNodeCreateConfirmed(nodeId);
  return drainPendingNodeContentRuntimePersist(nodeId);
}

export function cancelNodeCreateRuntimePersist(nodeId: string) {
  contentPersistQueue.cancel(nodeId);
  markNodeCreateConfirmed(nodeId);
}

export async function drainPendingNodeContentRuntimePersists() {
  const nodeIds = contentPersistQueue.nodeIds();
  const blocked = nodeIds.filter(isNodeCreatePending);
  if (blocked.length) await waitForNodeCreateConfirmations(blocked);
  const results = await Promise.all(nodeIds.map(contentPersistQueue.drain));
  return results.every(Boolean);
}

export function resetPendingNodeContentRuntimePersistsForTests() {
  contentPersistQueue.reset();
  resetContentEditAcknowledgementsForTests();
}
