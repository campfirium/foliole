import { isNodeTitleTruncated } from '../../lib/core/nodes/nodeTitleBudget';
import { resolveNodeDerivedTitle } from '../features/nodes/model/nodeDerivedTitle';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { canSaveNodeText, showNodeTitleShortenedNotice } from '../shared/ui/nodeTextSaveBudget';

import { admitApplicationTitle, settleApplicationAction } from './workspaceApplicationActionAdmission';
import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { buildRenamedWorkspaceNode, loadWorkspaceTitleDocument } from './workspaceNodeTitleMutation';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
import { buildCommittedTitleMutation, preserveCurrentBodyInPatch } from './workspaceStructureRenameCommit';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

export function createUpdateNodeTitleAction(set: WorkspaceSet): WorkspaceState['updateNodeTitle'] {
  return async (nodeId, title) => {
    const { entry: admission, libraryScope } = admitApplicationTitle(set, nodeId, title);
    const fail = () => { if (admission) set(state => settleApplicationAction(state, admission!.id, null)); return false; };
    const pendingDocument = loadWorkspaceTitleDocument(set, nodeId);
    const document = pendingDocument instanceof Promise ? await pendingDocument : pendingDocument;
    if (document === null) return fail();
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    let beforeTitle: string | null = null;
    set((state) => {
      if (state.libraryScope !== libraryScope) return state;
      const node = state.nodesById[nodeId];
      if (!node) return state;
      const nextNode = buildRenamedWorkspaceNode(node, title, document);
      if (!nextNode) return state;
      beforeTitle = node.title;
      nextNodeForSync = nextNode;
      localPatch = {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
      return state;
    });
    if (!nextNodeForSync) return fail();
    const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
    const result = await syncNodeContentMutationToRuntime(nextNodeForSync);
    let applied = false;
    let nodesToCache: WorkspaceState['nodesById'][string][] = [];
    set((state) => {
      if (state.libraryScope !== libraryScope) return state;
      const committed = buildCommittedTitleMutation({
        beforeTitle, localPatch, nextNodeForSync: nextNodeForSync!, nodeId, result,
        shouldUseLocalFallback, state, ...(admission ? { admission } : {})
      });
      if (!committed) {
        if (admission) {
          const accepted = result?.nodes.find(node => node.nodeId === nodeId);
          applied = Boolean(accepted && result?.updatedNodeIds?.includes(nodeId));
          return settleApplicationAction(state, admission.id, applied ? { ...admission, afterTitle: accepted!.title } : null);
        }
        return state;
      }
      applied = true;
      nodesToCache = committed.nodesToCache;
      return committed.patch;
    });
    if (applied) {
      nodesToCache.forEach(syncWorkspaceNodeDocumentCacheFromNode);
      if (isNodeTitleTruncated(title.trim())) showNodeTitleShortenedNotice();
    }
    return applied;
  };
}

export function createUpdateNodeDerivedTitleAction(set: WorkspaceSet): WorkspaceState['updateNodeDerivedTitle'] {
  return async (nodeId, content) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node)) {
        return state;
      }
      const nextTitle = resolveNodeDerivedTitle(node, content ?? node.content);
      if (node.title === nextTitle) {
        return state;
      }
      const nextNode = {
        ...node,
        title: nextTitle,
        updatedAt: new Date().toISOString()
      };
      if (!canSaveNodeText(nextNode)) return state;
      nextNodeForSync = nextNode;
      localPatch = {
        nodesById: {
          ...state.nodesById,
          [nodeId]: nextNode
        }
      };
      return state;
    });
    if (!nextNodeForSync) return false;
    const shouldUseLocalFallback = !hasWorkspaceNodeMutationRuntime();
    const result = await syncNodeContentMutationToRuntime(nextNodeForSync);
    let applied = false;
    let appliedNodeForCache: WorkspaceState['nodesById'][string] | null = null;
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatch(state, result)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      const titlePatch = preserveCurrentBodyInPatch(state, nodeId, acceptedPatch);
      appliedNodeForCache = titlePatch.nodesById?.[nodeId] ?? null;
      applied = true;
      return titlePatch;
    });
    if (applied && appliedNodeForCache) {
      syncWorkspaceNodeDocumentCacheFromNode(appliedNodeForCache);
    }
    return applied;
  };
}

export { createUpdateNodeRevealAction } from './workspaceStoreRevealAction';
