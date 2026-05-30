import {
  logEditorInputDiagnostic,
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';
import type { WorkspaceState } from './workspaceStore';
import type { TextAnchorLocatorSyncDiagnostics } from './workspaceTextAnchorLocatorSyncDiagnostics';

type WorkspaceNode = WorkspaceState['nodesById'][string];

export type UpdateNodeContentMetrics = {
  cloneNodesByIdMs: number;
  guardMs: number;
  guardReason: string | null;
  nextNodeMs: number;
  patchBuildMs: number;
  rendererRuntimeGapMs: number;
  runtimeApplyTotalMs: number;
  runtimeAwaitContinuationGapMs: number;
  runtimeMainBuildResultMs: number;
  runtimeMainEnqueueSearchMs: number;
  runtimeMainParseAnchorsMs: number;
  runtimeMainParseParentMs: number;
  runtimeMainScheduleMirrorMs: number;
  runtimeMainTotalMs: number;
  runtimeMainUpdateAnchorsMs: number;
  runtimeMainUpsertNodeMs: number;
  runtimeCacheSyncMs: number;
  runtimeInvokeMs: number;
  runtimeMutationMs: number;
  runtimePatchMs: number;
  runtimeResultCheckMs: number;
  runtimeSetMs: number;
  runtimeSnapshotMs: number;
  setMs: number;
  syncDiagnostics?: TextAnchorLocatorSyncDiagnostics;
  syncMs: number;
  totalStartedAt: number;
  wasGuarded: boolean;
};

export type UpdateNodeContentLocalState = {
  localPatch: Partial<WorkspaceState> | null;
  locatorUpdatedNodesForSync: WorkspaceNode[];
  nextNodeForSync: WorkspaceNode | null;
  nodeOrderForSync: string[];
};

type RuntimeMutationDiagnostics = {
  buildResultMs?: number;
  enqueueSearchMs?: number;
  parseAnchorsMs?: number;
  parseParentMs?: number;
  scheduleMirrorMs?: number;
  totalMs?: number;
  updateAnchorsMs?: number;
  upsertNodeMs?: number;
};

function readRuntimeMutationDiagnostics(result: unknown): RuntimeMutationDiagnostics | null {
  if (!result || typeof result !== 'object') {
    return null;
  }
  const diagnostics = (result as { diagnostics?: unknown }).diagnostics;
  return diagnostics && typeof diagnostics === 'object' ? diagnostics as RuntimeMutationDiagnostics : null;
}

export function applyRuntimeMutationDiagnostics(metrics: UpdateNodeContentMetrics, result: unknown) {
  const diagnostics = readRuntimeMutationDiagnostics(result);
  if (!diagnostics) {
    return;
  }
  metrics.runtimeMainBuildResultMs = diagnostics.buildResultMs ?? 0;
  metrics.runtimeMainEnqueueSearchMs = diagnostics.enqueueSearchMs ?? 0;
  metrics.runtimeMainParseAnchorsMs = diagnostics.parseAnchorsMs ?? 0;
  metrics.runtimeMainParseParentMs = diagnostics.parseParentMs ?? 0;
  metrics.runtimeMainScheduleMirrorMs = diagnostics.scheduleMirrorMs ?? 0;
  metrics.runtimeMainTotalMs = diagnostics.totalMs ?? 0;
  metrics.runtimeMainUpdateAnchorsMs = diagnostics.updateAnchorsMs ?? 0;
  metrics.runtimeMainUpsertNodeMs = diagnostics.upsertNodeMs ?? 0;
}

export function createUpdateNodeContentMetrics(diagnosticsEnabled: boolean): UpdateNodeContentMetrics {
  return {
    cloneNodesByIdMs: 0,
    guardMs: 0,
    guardReason: null,
    nextNodeMs: 0,
    patchBuildMs: 0,
    rendererRuntimeGapMs: 0,
    runtimeApplyTotalMs: 0,
    runtimeAwaitContinuationGapMs: 0,
    runtimeMainBuildResultMs: 0,
    runtimeMainEnqueueSearchMs: 0,
    runtimeMainParseAnchorsMs: 0,
    runtimeMainParseParentMs: 0,
    runtimeMainScheduleMirrorMs: 0,
    runtimeMainTotalMs: 0,
    runtimeMainUpdateAnchorsMs: 0,
    runtimeMainUpsertNodeMs: 0,
    runtimeCacheSyncMs: 0,
    runtimeInvokeMs: 0,
    runtimeMutationMs: 0,
    runtimePatchMs: 0,
    runtimeResultCheckMs: 0,
    runtimeSetMs: 0,
    runtimeSnapshotMs: 0,
    setMs: 0,
    syncMs: 0,
    totalStartedAt: diagnosticsEnabled ? readEditorInputDiagnosticTime() : 0,
    wasGuarded: false
  };
}

export function createUpdateNodeContentLocalState(): UpdateNodeContentLocalState {
  return {
    localPatch: null,
    locatorUpdatedNodesForSync: [],
    nextNodeForSync: null,
    nodeOrderForSync: []
  };
}

export function logUpdateNodeContentDiagnostic(args: {
  applied: boolean;
  contentLength: number;
  event?: 'update-node-content' | 'update-node-content-runtime-persist';
  localState: UpdateNodeContentLocalState;
  metrics: UpdateNodeContentMetrics;
  nodeId: string;
}) {
  logEditorInputDiagnostic(args.event ?? 'update-node-content', {
    applied: args.applied,
    cloneNodesByIdMs: args.metrics.cloneNodesByIdMs,
    contentLength: args.contentLength,
    guardMs: args.metrics.guardMs,
    guardReason: args.metrics.guardReason,
    locatorCandidateNodes: args.metrics.syncDiagnostics?.candidateNodes,
    locatorScannedNodes: args.metrics.syncDiagnostics?.scannedNodes,
    locatorUpdatedNodes: args.localState.locatorUpdatedNodesForSync.length,
    nextNodeMs: args.metrics.nextNodeMs,
    nodeId: args.nodeId,
    nodeOrderLength: args.localState.nodeOrderForSync.length,
    patchBuildMs: args.metrics.patchBuildMs,
    rendererRuntimeGapMs: args.metrics.rendererRuntimeGapMs,
    runtimeApplyTotalMs: args.metrics.runtimeApplyTotalMs,
    runtimeAwaitContinuationGapMs: args.metrics.runtimeAwaitContinuationGapMs,
    runtimeCacheSyncMs: args.metrics.runtimeCacheSyncMs,
    runtimeMainBuildResultMs: args.metrics.runtimeMainBuildResultMs,
    runtimeMainEnqueueSearchMs: args.metrics.runtimeMainEnqueueSearchMs,
    runtimeMainParseAnchorsMs: args.metrics.runtimeMainParseAnchorsMs,
    runtimeMainParseParentMs: args.metrics.runtimeMainParseParentMs,
    runtimeMainScheduleMirrorMs: args.metrics.runtimeMainScheduleMirrorMs,
    runtimeMainTotalMs: args.metrics.runtimeMainTotalMs,
    runtimeMainUpdateAnchorsMs: args.metrics.runtimeMainUpdateAnchorsMs,
    runtimeMainUpsertNodeMs: args.metrics.runtimeMainUpsertNodeMs,
    runtimeMutationMs: args.metrics.runtimeMutationMs,
    runtimeInvokeMs: args.metrics.runtimeInvokeMs,
    runtimePatchMs: args.metrics.runtimePatchMs,
    runtimeResultCheckMs: args.metrics.runtimeResultCheckMs,
    runtimeSetMs: args.metrics.runtimeSetMs,
    runtimeSnapshotMs: args.metrics.runtimeSnapshotMs,
    setMs: args.metrics.setMs,
    syncMs: args.metrics.syncMs,
    totalMs: readEditorInputDiagnosticTime() - args.metrics.totalStartedAt,
    wasGuarded: args.metrics.wasGuarded
  });
}
