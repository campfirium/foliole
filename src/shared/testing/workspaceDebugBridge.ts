import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NodeAnchorLink, NodeImageRegionGroup } from '../../features/nodes/model/nodeTypes';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { getRuntimeInvoke } from '../platform/bridge';

import { createClipboardImportHandler } from './workspaceDebugAttachmentImport';

interface DebugNodeSeed {
  anchorLink?: NodeAnchorLink | null;
  content: string;
  id: string;
  imageRegions?: NodeImageRegionGroup[] | null;
  kind?: 'folder' | 'item' | 'topic';
  parentNodeId?: string | null;
  reveal?: string | null;
  title: string;
}

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
    content: string;
    id: string;
    parentNodeId: string | null;
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
  getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } } | null;
  listNodes: () => Array<{ id: string; title: string }>;
  openNode: (nodeId: string) => Promise<boolean>;
  restoreNode: (nodeId: string) => Promise<boolean>;
  setNodeViewState: (args: { from: number; nodeId: string; scrollTop?: number; to: number }) => boolean;
  seedNodes: (nodes: DebugNodeSeed[]) => Promise<void>;
  updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
}

type WorkspaceDebugWindow = Window & {
  electronAPI?: { debug?: unknown };
  __folioleWorkspaceDebug?: WorkspaceDebugApi;
};

function isWorkspaceDebugEnabled() {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    return true;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as WorkspaceDebugWindow).electronAPI?.debug);
}

function buildSeededNodes(nodes: DebugNodeSeed[], createdAt: string, initialNode: ReturnType<typeof createInitialWorkspaceState>['nodesById'][string]) {
  return Object.fromEntries(
    nodes.map((node, index) => [
      node.id,
      {
        ...initialNode,
        anchorLink: node.anchorLink ?? null,
        content: node.content,
        createdAt,
        hasContent: node.content.trim().length > 0,
        hasReveal: node.reveal != null,
        id: node.id,
        imageRegions: node.imageRegions ?? null,
        kind: node.kind ?? initialNode.kind,
        parentNodeId: node.parentNodeId ?? null,
        reveal: node.reveal ?? null,
        title: node.title,
        updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`
      }
    ])
  );
}

async function persistSeedNodes(nodes: DebugNodeSeed[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const basePayload = {
      anchorLink: node.anchorLink ?? null,
      content: node.content,
      createdAt: '2026-04-08T00:00:00.000Z',
      desiredRetention: null,
      hideTitleHeading: false,
      imageRegions: node.imageRegions ?? null,
      isTitleManual: true,
      kind: node.kind ?? 'topic',
      nodeId: node.id,
      parentNodeId: node.parentNodeId ?? null,
      position: index,
      priority: null,
      reading: null,
      reveal: node.reveal ?? null,
      title: node.title,
      updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`,
      virtualFilter: null
    };
    const command =
      basePayload.kind === 'folder'
        ? NATIVE_COMMANDS.createFolder
        : basePayload.kind === 'item'
          ? NATIVE_COMMANDS.createItem
          : NATIVE_COMMANDS.createTopic;
    await runtimeInvoke(command, basePayload);
  }

  await runtimeInvoke(NATIVE_COMMANDS.replaceNodeOrder, { nodeIds: nodes.map((node) => node.id) });
}

function getExistingNodeState(nodeId: string) {
  const state = useWorkspaceStore.getState();
  if (!state.nodesById[nodeId]) {
    return null;
  }
  return state;
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
      state.restoreNode(nodeId);
      return true;
    },
    updateNodeContent: async (nodeId, content) => {
      const state = getExistingNodeState(nodeId);
      if (!state) return false;
      state.updateNodeContent(nodeId, content);
      return true;
    }
  };
}

function createNodeReadDebugApi(): Pick<
  WorkspaceDebugApi,
  'getActiveNodeId' | 'getNode' | 'getNodeViewState' | 'listNodes' | 'openNode' | 'setNodeViewState'
> {
  return {
    getActiveNodeId: () => useWorkspaceStore.getState().activeNodeId,
    getNode: (nodeId) => {
      const state = useWorkspaceStore.getState();
      const node = state.nodesById[nodeId];
      if (!node) {
        return null;
      }
      return {
        anchorKind: node.anchorLink?.kind ?? null,
        content: node.content,
        id: node.id,
        parentNodeId: node.parentNodeId,
        reveal: node.reveal,
        title: node.title,
        trashed: state.trashedNodeIds.includes(nodeId)
      };
    },
    getNodeViewState: (nodeId) => useWorkspaceStore.getState().nodeViewById[nodeId] ?? null,
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

function createSeedNodeDebugApi(): Pick<WorkspaceDebugApi, 'seedNodes'> {
  return {
    seedNodes: async (nodes) => {
      const initial = createInitialWorkspaceState(new Date('2026-04-08T00:00:00.000Z'));
      const seededNodesById = buildSeededNodes(nodes, '2026-04-08T00:00:00.000Z', initial.nodesById['node-1']);
      useWorkspaceStore.setState({
        ...initial,
        activeNodeId: nodes[0]?.id ?? null,
        isHydrated: true,
        nodeOrder: nodes.map((node) => node.id),
        nodesById: seededNodesById,
        trashedNodeIds: []
      });
      await persistSeedNodes(nodes);
    }
  };
}

function createWorkspaceDebugApi(): WorkspaceDebugApi {
  return {
    ...createNodeMutationDebugApi(),
    ...createNodeReadDebugApi(),
    importClipboardImageAttachment: createClipboardImportHandler(),
    ...createSeedNodeDebugApi()
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

  targetWindow.__folioleWorkspaceDebug = createWorkspaceDebugApi();
}
