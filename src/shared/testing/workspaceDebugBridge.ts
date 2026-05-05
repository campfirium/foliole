import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

interface DebugNodeSeed {
  content: string;
  id: string;
  kind?: 'folder' | 'item' | 'topic';
  parentNodeId?: string | null;
  reveal?: string | null;
  title: string;
}

interface WorkspaceDebugApi {
  getActiveNodeId: () => string | null;
  getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } } | null;
  listNodes: () => Array<{ id: string; title: string }>;
  openNode: (nodeId: string) => Promise<boolean>;
  seedNodes: (nodes: DebugNodeSeed[]) => void;
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

export function installWorkspaceDebugBridge() {
  if (!isWorkspaceDebugEnabled() || typeof window === 'undefined') {
    return;
  }

  const targetWindow = window as WorkspaceDebugWindow;
  if (targetWindow.__folioleWorkspaceDebug) {
    return;
  }

  targetWindow.__folioleWorkspaceDebug = {
    getActiveNodeId: () => useWorkspaceStore.getState().activeNodeId,
    getNodeViewState: (nodeId) => useWorkspaceStore.getState().nodeViewById[nodeId] ?? null,
    listNodes: () =>
      useWorkspaceStore
        .getState()
        .nodeOrder.map((nodeId) => ({ id: nodeId, title: useWorkspaceStore.getState().nodesById[nodeId]?.title ?? nodeId })),
    openNode: async (nodeId) => {
      const state = useWorkspaceStore.getState();
      if (!state.nodesById[nodeId]) {
        return false;
      }
      try {
        await openWorkspaceNodeWithPreparedDocument(nodeId);
        return true;
      } catch {
        return false;
      }
    },
    seedNodes: (nodes) => {
      const initial = createInitialWorkspaceState(new Date('2026-04-08T00:00:00.000Z'));
      const seededNodesById = Object.fromEntries(
        nodes.map((node, index) => [
          node.id,
          {
            ...initial.nodesById['node-1'],
            anchorLink: null,
            content: node.content,
            createdAt: '2026-04-08T00:00:00.000Z',
            hasContent: node.content.trim().length > 0,
            hasReveal: node.reveal != null,
            id: node.id,
            kind: node.kind ?? initial.nodesById['node-1'].kind,
            parentNodeId: node.parentNodeId ?? null,
            reveal: node.reveal ?? null,
            title: node.title,
            updatedAt: `2026-04-08T00:00:${String(index).padStart(2, '0')}.000Z`
          }
        ])
      );
      const firstNodeId = nodes[0]?.id ?? null;
      useWorkspaceStore.setState({
        ...initial,
        activeNodeId: firstNodeId,
        nodeOrder: nodes.map((node) => node.id),
        nodesById: seededNodesById,
        trashedNodeIds: []
      });
    }
  };
}
