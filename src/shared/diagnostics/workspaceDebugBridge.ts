import { readCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { createClipboardImportHandler } from './workspaceDebugAttachmentImport';
import { isWorkspaceDebugEnabledForRuntime } from './workspaceDebugBridgeGate';
import type { WorkspaceDebugApi, WorkspaceDebugWindow } from './workspaceDebugBridgeTypes';
import { getEditorOperationHistory } from './workspaceDebugHistory';
import { forceUpdateDebugNodeContent } from './workspaceDebugNodeContent';
import { completeDebugReviewSession } from './workspaceDebugReviewSession';
import { createSeedNodeDebugApi } from './workspaceDebugSeedApi';
import { type WorkspaceSyncDebugApi, createWorkspaceSyncDebugApi } from './workspaceSyncDebugBridge';

function isWorkspaceDebugEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  return isWorkspaceDebugEnabledForRuntime({
    isDev: import.meta.env.DEV,
    isTest: import.meta.env.MODE === 'test',
    workspaceDebugBridge: (window as WorkspaceDebugWindow).electronAPI?.debug?.workspaceDebugBridge
  });
}

function canPersistWorkspaceDebugSeeds() {
  return (window as WorkspaceDebugWindow).electronAPI?.debug?.workspaceDebugSeedPersistence === true;
}

function getExistingNodeState(nodeId: string) {
  const state = useWorkspaceStore.getState();
  if (!state.nodesById[nodeId]) {
    return null;
  }
  return state;
}

function getDebugNode(nodeId: string): ReturnType<WorkspaceDebugApi['getNode']> {
  const state = useWorkspaceStore.getState();
  const node = state.nodesById[nodeId];
  if (!node) {
    return null;
  }
  return {
    anchorKind: node.anchorLink?.kind ?? null,
    anchorLink: node.anchorLink ?? null,
    content: node.content,
    id: node.id,
    kind: node.kind,
    parentNodeId: node.parentNodeId,
    reading: node.reading ? { nextAt: node.reading.nextAt, state: node.reading.state } : null,
    reveal: node.reveal,
    review: node.review ? { due: node.review.due, state: node.review.state } : null,
    shelvedAt: node.shelvedAt ?? null,
    title: node.title,
    trashed: state.trashedNodeIds.includes(nodeId)
  };
}

function getDebugReviewSession(): ReturnType<WorkspaceDebugApi['getReviewSession']> {
  const reviewSession = useWorkspaceStore.getState().reviewSession;
  return {
    currentNodeId: reviewSession.currentNodeId,
    queueNodeIds: [...reviewSession.queueNodeIds],
    ...(reviewSession.soonNodeIds ? { soonNodeIds: [...reviewSession.soonNodeIds] } : {})
  };
}

const upsertTopicForDebug: WorkspaceDebugApi['upsertTopicForDebug'] = ({ content, id, title }) => {
  const state = useWorkspaceStore.getState();
  const baseNode = Object.values(state.nodesById).find((node) => !node.specialKind) ??
    Object.values(state.nodesById)[0];
  if (!baseNode) return false;
  const node = {
    ...baseNode,
    anchorLink: null,
    bodyStatus: content.trim() ? 'ready' as const : 'empty' as const,
    content,
    hasContent: content.trim().length > 0,
    id,
    kind: 'topic' as const,
    parentNodeId: null,
    shelvedAt: null,
    title,
    updatedAt: new Date().toISOString()
  };
  delete node.specialKind;
  delete node.virtualFilter;
  useWorkspaceStore.setState({
    nodeOrder: state.nodeOrder.includes(id) ? state.nodeOrder : [...state.nodeOrder, id],
    nodesById: { ...state.nodesById, [id]: node },
    rendererBoundaryKeepNodeIds: Array.from(new Set([...state.rendererBoundaryKeepNodeIds, id]))
  });
  return true;
};

function createNodeMutationDebugApi(): Pick<
  WorkspaceDebugApi,
  | 'createTextClozeChild'
  | 'createTextHighlightChild'
  | 'completeReviewSessionForDebug'
  | 'deleteNode'
  | 'deleteNodePermanently'
  | 'restoreNode'
  | 'shelveNode'
  | 'updateNodeContent'
  | 'upsertTopicForDebug'
> {
  return {
    completeReviewSessionForDebug: completeDebugReviewSession,
    createTextClozeChild: async ({ anchorId, anchorLink, answer, parentNodeId, prompt }) =>
      useWorkspaceStore.getState().createQANodeFromSelection(parentNodeId, prompt, answer, anchorId, anchorLink ?? undefined),
    createTextHighlightChild: async ({ anchorId, anchorLink, parentNodeId, text }) =>
      useWorkspaceStore.getState().createHighlightNodeFromSelection(parentNodeId, text, anchorId, anchorLink ?? undefined),
    deleteNode: async (nodeId) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      state.deleteNode(nodeId);
      return true;
    },
    deleteNodePermanently: async (nodeId) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      state.deleteNodePermanently(nodeId);
      return true;
    },
    restoreNode: async (nodeId) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      await state.restoreNode(nodeId);
      return true;
    },
    shelveNode: (nodeId, now) => {
      const state = getExistingNodeState(nodeId);
      return state ? state.shelveNode(nodeId, now) : false;
    },
    updateNodeContent: async (nodeId, content) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      state.updateNodeContent(nodeId, content);
      if (useWorkspaceStore.getState().nodesById[nodeId]?.content === content) return true;
      forceUpdateDebugNodeContent(nodeId, content);
      return true;
    },
    upsertTopicForDebug
  };
}

function createNodeReadDebugApi(): Pick<
  WorkspaceDebugApi,
  | 'getActiveNodeId'
  | 'getEditorOperationHistory'
  | 'getNode'
  | 'getNodeViewState'
  | 'getReviewSession'
  | 'isHydrated'
  | 'listNodes'
  | 'openNode'
  | 'setNodeViewState'
> {
  return {
    getActiveNodeId: () => useWorkspaceStore.getState().activeNodeId,
    getEditorOperationHistory,
    getNode: getDebugNode,
    getNodeViewState: (nodeId) => useWorkspaceStore.getState().nodeViewById[nodeId] ?? null,
    isHydrated: () => useWorkspaceStore.getState().isHydrated,
    getReviewSession: getDebugReviewSession,
    listNodes: () => {
      const state = useWorkspaceStore.getState();
      return state.nodeOrder.map((nodeId) => ({ id: nodeId, title: state.nodesById[nodeId]?.title ?? nodeId }));
    },
    openNode: async (nodeId) => {
      if (!getExistingNodeState(nodeId)) {
        return false;
      }
      try {
        const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
        await openWorkspaceNodeWithPreparedDocument(nodeId, {
          forceLoad: Boolean(cachedDocument),
          preloadedDocument: cachedDocument
        });
        return true;
      } catch {
        return false;
      }
    },
    setNodeViewState: ({ from, nodeId, scrollTop = 0, to }) => {
      const state = getExistingNodeState(nodeId);
      if (!state) {
        return false;
      }
      state.setNodeViewState(nodeId, {
        scrollTop,
        selection: { from, to }
      });
      return true;
    }
  };
}

function createWorkspaceDebugApi(): WorkspaceDebugApi {
  return {
    ...createNodeMutationDebugApi(),
    ...createNodeReadDebugApi(),
    importClipboardImageAttachment: createClipboardImportHandler(),
    ...createSeedNodeDebugApi(canPersistWorkspaceDebugSeeds),
    ...createWorkspaceSyncDebugApi()
  };
}

export function installWorkspaceDebugBridge() {
  if (!isWorkspaceDebugEnabled() || typeof window === 'undefined') {
    return;
  }

  const targetWindow = window as WorkspaceDebugWindow;
  if (targetWindow.__folioleWorkspaceDebug) {
    return;
  }

  targetWindow.__folioleWorkspaceDebug = createWorkspaceDebugApi() as WorkspaceDebugApi & WorkspaceSyncDebugApi;
}
