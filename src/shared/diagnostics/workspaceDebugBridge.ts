import type { NodeAnchorLink } from '../../features/nodes/model/nodeTypes';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { createClipboardImportHandler } from './workspaceDebugAttachmentImport';
import { isWorkspaceDebugEnabledForRuntime } from './workspaceDebugBridgeGate';
import { forceUpdateDebugNodeContent } from './workspaceDebugNodeContent';
import { createSeedNodeDebugApi, type SeedNodeDebugApi } from './workspaceDebugSeedApi';
import { type WorkspaceSyncDebugApi, createWorkspaceSyncDebugApi } from './workspaceSyncDebugBridge';

interface WorkspaceDebugApi {
  createTextClozeChild: (args: {
    anchorId: string;
    anchorLink?: NodeAnchorLink | null;
    answer: string;
    parentNodeId: string;
    prompt: string;
  }) => Promise<string | null>;
  createTextHighlightChild: (args: {
    anchorId: string;
    anchorLink?: NodeAnchorLink | null;
    parentNodeId: string;
    text: string;
  }) => Promise<string | null>;
  deleteNode: (nodeId: string) => Promise<boolean>;
  deleteNodePermanently: (nodeId: string) => Promise<boolean>;
  getActiveNodeId: () => string | null;
  getNode: (nodeId: string) => {
    anchorKind: 'highlight' | 'cloze' | null;
    anchorLink: NodeAnchorLink | null;
    content: string;
    id: string;
    parentNodeId: string | null;
    reading: { nextAt: string; state: string } | null;
    reveal: string | null;
    title: string;
    trashed: boolean;
  } | null;
  importClipboardImageAttachment: (args: {
    bytesBase64: string;
    mimeType: string;
    nodeId: string;
    originalName?: string;
  }) => Promise<string | null>;
  getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } | null } | null;
  getReviewSession: () => {
    currentNodeId: string | null;
    queueNodeIds: string[];
    soonNodeIds?: string[];
  };
  listNodes: () => Array<{ id: string; title: string }>;
  openNode: (nodeId: string) => Promise<boolean>;
  restoreNode: (nodeId: string) => Promise<boolean>;
  setNodeViewState: (args: { from: number; nodeId: string; scrollTop?: number; to: number }) => boolean;
  seedNodes: SeedNodeDebugApi['seedNodes'];
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
}

type WorkspaceDebugWindow = Window & {
  electronAPI?: { debug?: { workspaceDebugBridge?: boolean; workspaceDebugSeedPersistence?: boolean } };
  __folioleWorkspaceDebug?: WorkspaceDebugApi;
};

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
    parentNodeId: node.parentNodeId,
    reading: node.reading ? { nextAt: node.reading.nextAt, state: node.reading.state } : null,
    reveal: node.reveal,
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

function createNodeMutationDebugApi(): Pick<
  WorkspaceDebugApi,
  'createTextClozeChild' | 'createTextHighlightChild' | 'deleteNode' | 'deleteNodePermanently' | 'restoreNode' | 'updateNodeContent'
> {
  return {
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
    updateNodeContent: async (nodeId, content) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      state.updateNodeContent(nodeId, content);
      if (useWorkspaceStore.getState().nodesById[nodeId]?.content === content) return true;
      forceUpdateDebugNodeContent(nodeId, content);
      return true;
    }
  };
}

function createNodeReadDebugApi(): Pick<
  WorkspaceDebugApi,
  'getActiveNodeId' | 'getNode' | 'getNodeViewState' | 'getReviewSession' | 'listNodes' | 'openNode' | 'setNodeViewState'
> {
  return {
    getActiveNodeId: () => useWorkspaceStore.getState().activeNodeId,
    getNode: getDebugNode,
    getNodeViewState: (nodeId) => useWorkspaceStore.getState().nodeViewById[nodeId] ?? null,
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
        await openWorkspaceNodeWithPreparedDocument(nodeId);
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
