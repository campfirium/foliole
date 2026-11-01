import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { canSaveNodeText } from '../shared/ui/nodeTextSaveBudget';
import { patchWorkspaceRecord } from '../shared/workspaceRecordPatch';

import { createUpdateNodeContentMetrics } from './workspaceNodeContentUpdateDiagnostics';
import { isLatestNodeRevealVersion, markNodeRevealEdited, markNodeRevealPersisted } from './workspaceNodeContentVersionGuard';
import { loadWorkspaceTitleDocument } from './workspaceNodeTitleMutation';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from './workspaceRendererBoundary';
import { scheduleNodeContentRuntimePersist } from './workspaceStoreContentRuntimePersist';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (patch: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState> | WorkspaceState)) => void;

export function createUpdateNodeRevealAction(set: Set): WorkspaceState['updateNodeReveal'] {
  return async (nodeId, reveal, options) => {
    let libraryScope: WorkspaceState['libraryScope'];
    set(state => { libraryScope = state.libraryScope; return state; });
    const loading = loadWorkspaceTitleDocument(set, nodeId);
    if (loading === null || (loading && options?.historySave)) { options?.historySave?.reject(); return false; }
    const version = markNodeRevealEdited(nodeId);
    const document = loading ? await loading : undefined;
    if (document === null) {
      set(state => { if (state.libraryScope === libraryScope) markNodeRevealPersisted(nodeId, version); return state; });
      return false;
    }
    let currentScope = true;
    let node: WorkspaceState['nodesById'][string] | null = null;
    let nodeOrder: string[] = [];
    set(state => {
      const original = state.nodesById[nodeId];
      currentScope = state.libraryScope === libraryScope;
      if (!currentScope || !isLatestNodeRevealVersion(nodeId, version)) return state;
      const current = original && document && !isNodeDocumentLoaded(original) ? mergeWorkspaceNodeDocument(original, document) : original;
      if (!current || isProtectedRootNode(current) || state.trashedNodeIds.includes(nodeId)
        || (current.reveal === null && current.hasReveal !== true)) return state;
      const next = { ...current, hasReveal: true, reveal, updatedAt: new Date().toISOString() };
      if (!canSaveNodeText(next)) return state;
      if (options?.newImageReferences?.length) next.pendingImageReferences = [...new Map(
        [...current.pendingImageReferences ?? [], ...options.newImageReferences].map(reference => [reference.storage_key, reference])).values()];
      node = next;
      nodeOrder = state.nodeOrder;
      return { nodesById: patchWorkspaceRecord(state.nodesById, { [nodeId]: next }) };
    });
    if (!node) { if (currentScope) markNodeRevealPersisted(nodeId, version); options?.historySave?.reject(); return false; }
    const commit = scheduleNodeContentRuntimePersist({
      field: 'reveal', historySave: options?.historySave, contentLength: reveal.length, diagnosticsEnabled: false,
      localState: { locatorUpdatedNodesForSync: [], nextNodeForSync: node, nodeOrderForSync: nodeOrder },
      metrics: createUpdateNodeContentMetrics(false), nextNodeForSync: node, set, version
    });
    return options?.historySave ? true : commit.run();
  };
}
