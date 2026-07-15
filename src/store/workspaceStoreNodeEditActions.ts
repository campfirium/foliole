import {
  extractUniqueArticleTitleHeading,
  replaceUniqueArticleTitleHeading
} from '../features/nodes/model/articleTitleHeading';
import { deriveNodeTitleFromContent, UNTITLED_NODE_TITLE } from '../features/nodes/model/deriveNodeTitle';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { syncWorkspaceNodeDocumentCacheFromNode } from './workspaceNodeDocumentCache';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import {
  hasWorkspaceNodeMutationRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeRevealMutationToRuntime
} from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

function preserveCurrentNodeBody(current: WorkspaceState['nodesById'][string] | undefined, next: WorkspaceState['nodesById'][string]) {
  if (!current) {
    return next;
  }
  return {
    ...next,
    content: current.content,
    ...(current.hasContent === undefined ? {} : { hasContent: current.hasContent })
  };
}

function preserveCurrentBodyInPatch(
  state: WorkspaceState,
  nodeId: string,
  patch: Partial<WorkspaceState>
): Partial<WorkspaceState> {
  const nextNode = patch.nodesById?.[nodeId];
  if (!nextNode || !patch.nodesById) {
    return patch;
  }
  return {
    ...patch,
    nodesById: {
      ...patch.nodesById,
      [nodeId]: preserveCurrentNodeBody(state.nodesById[nodeId], nextNode)
    }
  };
}

function syncUniqueArticleHeadingFromTitle(
  node: WorkspaceState['nodesById'][string],
  title: string
) {
  if (node.kind !== 'topic') {
    return node.content;
  }
  return replaceUniqueArticleTitleHeading(node.content, title) ?? node.content;
}

function resolveDerivedTitle(node: WorkspaceState['nodesById'][string], content: string) {
  if (node.kind === 'topic') {
    const articleTitle = extractUniqueArticleTitleHeading(content)?.title;
    if (articleTitle) {
      return articleTitle;
    }
  }
  return node.isTitleManual ? node.title : deriveNodeTitleFromContent(content);
}

export function createUpdateNodeTitleAction(set: WorkspaceSet): WorkspaceState['updateNodeTitle'] {
  return async (nodeId, title) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node)) {
        return state;
      }
      const nextTitle = title.trim() || UNTITLED_NODE_TITLE;
      const nextContent = syncUniqueArticleHeadingFromTitle(node, nextTitle);
      const nextNode = {
        ...node,
        content: nextContent,
        hasContent: nextContent.trim().length > 0,
        hideTitleHeading: false,
        title: nextTitle,
        isTitleManual: true,
        updatedAt: new Date().toISOString()
      };
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
    let nodesToCache: WorkspaceState['nodesById'][string][] = [];
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatch(state, result)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      applied = true;
      nodesToCache = result
        ? result.nodes.flatMap((snapshot) => acceptedPatch.nodesById?.[snapshot.nodeId]
            ? [acceptedPatch.nodesById[snapshot.nodeId]!]
            : [])
        : [nextNodeForSync!];
      return acceptedPatch;
    });
    if (applied) {
      nodesToCache.forEach(syncWorkspaceNodeDocumentCacheFromNode);
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
      const nextTitle = resolveDerivedTitle(node, content ?? node.content);
      if (node.title === nextTitle) {
        return state;
      }
      const nextNode = {
        ...node,
        title: nextTitle,
        updatedAt: new Date().toISOString()
      };
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

export function createUpdateNodeRevealAction(set: WorkspaceSet): WorkspaceState['updateNodeReveal'] {
  return async (nodeId, reveal) => {
    let nextNodeForSync: WorkspaceState['nodesById'][string] | null = null;
    let localPatch: Partial<WorkspaceState> | null = null;
    set((state) => {
      const node = state.nodesById[nodeId];
      if (!node || isProtectedRootNode(node) || node.reveal === null) {
        return state;
      }
      const nextNode = {
        ...node,
        hasReveal: reveal !== null,
        reveal,
        updatedAt: new Date().toISOString()
      };
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
    const result = await syncNodeRevealMutationToRuntime(nextNodeForSync);
    let applied = false;
    set((state) => {
      const acceptedPatch = result
        ? createWorkspaceNodeMutationPatch(state, result)
        : shouldUseLocalFallback ? localPatch : null;
      if (!acceptedPatch) return state;
      applied = true;
      return acceptedPatch;
    });
    if (applied) {
      syncWorkspaceNodeDocumentCacheFromNode(nextNodeForSync);
    }
    return applied;
  };
}
