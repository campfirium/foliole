import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import type { WorkspaceState } from './workspaceStore';
import { createInitialWorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

type WorkspaceSetInput =
  | WorkspaceState
  | Partial<WorkspaceState>
  | ((snapshot: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>);

function createWorkspaceFixture(): WorkspaceState {
  const initial = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
  return {
    ...initial,
    goBack: () => null,
    goForward: () => null,
    goToParent: () => null,
    jumpToAncestorNode: () => null,
    openNode: () => null,
    resetLayout: () => undefined,
    setNodeViewState: () => undefined,
    setDocumentMaxWidth: () => undefined,
    setListWidth: () => undefined,
    setListCollapsed: () => undefined,
    setRightSidebarWidth: () => undefined,
    setRightSidebarCollapsed: () => undefined,
    setActiveNode: () => undefined,
    updateNodeTitle: async () => false,
    updateNodeContent: async () => false,
    updateVirtualNodeFilter: () => undefined,
    updateNodeReveal: async () => false,
    updateNodePriority: () => undefined,
    updateNodeDesiredRetention: () => undefined,
    updateNodeShortTerm: () => undefined,
    setNodeSequentialReading: () => false,
    dismissNode: () => false,
    undoWorkspaceAction: () => false,
    redoWorkspaceAction: () => false,
    pushEditorOperationEntry: () => undefined,
    deleteEditorAnnotationNodes: () => undefined,
    undoEditorOperation: () => false,
    redoEditorOperation: () => false,
    relearnNode: () => false,
    startReviewSession: () => false,
    resumeReviewSession: () => false,
    setReviewSessionMode: () => undefined,
    revealReviewAnswer: () => undefined,
    gradeReviewCard: async () => false,
    completeReviewItem: async () => false,
    deferReviewItem: async () => false,
    soonReviewItem: async () => false,
    dismissReviewItem: async () => false,
    exitReviewSession: () => undefined,
    deleteNode: () => undefined,
    deleteImageClozeRegion: () => undefined,
    deleteNodes: () => undefined,
    restoreNode: async () => null,
    deleteNodePermanently: () => undefined,
    deleteNodesPermanently: () => undefined,
    createRootNode: async () => 'unused',
    createChildNode: async () => 'unused',
    createVirtualNode: async () => 'unused',
    createHighlightNodeFromSelection: async () => null,
    createQANodeFromSelection: async () => null,
    createFormulaClozeNode: async () => null,
    createImageClozeNodes: async () => [],
    moveNode: async () => false,
    moveNodes: async () => false
  };
}

function createSetStateHarness(initialState: WorkspaceState) {
  let state = initialState;
  const setState = (partial: WorkspaceSetInput) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  return {
    setState,
    getState: () => state
  };
}

function getInvokedCommands(invoke: ReturnType<typeof vi.fn>): string[] {
  return invoke.mock.calls.map((call) => call[0] as string);
}

function expectNoWorkspacePersist(invoke: ReturnType<typeof vi.fn>) {
  expect(getInvokedCommands(invoke)).not.toContain('save_workspace_state');
}

async function createActionsHarness() {
  const invoke = vi.fn().mockImplementation(async (command, args) => {
    if (command === 'create_folder' || command === 'create_topic' || command === 'create_item') {
      const payload = args as { activeNodeId?: string | null; nodeId: string; nodeOrder?: string[] };
      return {
        activeNodeId: payload.activeNodeId ?? payload.nodeId,
        createdNodeIds: [payload.nodeId],
        nodeOrder: payload.nodeOrder ?? [payload.nodeId],
        nodes: [payload]
      };
    }
    if (command === 'update_node_content' || command === 'update_node_reveal') {
      const payload = args as { nodeId: string };
      return {
        nodes: [payload],
        updatedNodeIds: [payload.nodeId]
      };
    }
    if (command === 'update_node_content_with_anchors') {
      const payload = args as { affectedAnchors?: unknown[]; parent: { nodeId: string } };
      return {
        anchorUpdates: payload.affectedAnchors ?? [],
        nodes: [payload.parent],
        updatedNodeIds: [payload.parent.nodeId]
      };
    }
    if (command === 'move_nodes') {
      return {
        movedNodeIds: (args as { nodes: Array<{ nodeId: string }> }).nodes.map((node) => node.nodeId),
        nodeOrder: (args as { nodeOrder: string[] }).nodeOrder
      };
    }
    return null;
  });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
  const harness = createSetStateHarness(createWorkspaceFixture());
  const actions = createWorkspaceNodeActions(harness.setState);
  const seedNodeId = (await actions.createRootNode(''))!;
  vi.clearAllMocks();
  return {
    actions,
    harness,
    invoke,
    seedNodeId
  };
}

describe('workspace node actions runtime guardrail', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('updateNodeContent uses update_node_content only and never save_workspace_state', async () => {
    const { actions, invoke, seedNodeId } = await createActionsHarness();

    await actions.updateNodeContent(seedNodeId, '# Updated title\n\nBody');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_content_with_anchors']);
    expectNoWorkspacePersist(invoke);
  });

  it('createChildNode uses sqlite commands and never save_workspace_state', async () => {
    const { actions, invoke, seedNodeId } = await createActionsHarness();

    (await actions.createChildNode(seedNodeId, 'Child body'))!;

    expect(getInvokedCommands(invoke)).toEqual(['create_topic']);
    expectNoWorkspacePersist(invoke);
  });

  it('createChildNode does not sync invalid folder creation under a topic', async () => {
    const { actions, invoke, seedNodeId } = await createActionsHarness();

    (await actions.createChildNode(seedNodeId, '', 'folder'))!;

    expect(getInvokedCommands(invoke)).toEqual([]);
    expectNoWorkspacePersist(invoke);
  });

  it('moveNode uses sqlite commands and never save_workspace_state', async () => {
    const { actions, invoke } = await createActionsHarness();
    const firstFolderId = (await actions.createRootNode('Folder A', 'folder'))!;
    const secondFolderId = (await actions.createRootNode('Folder B', 'folder'))!;

    vi.clearAllMocks();
    await actions.moveNodes([secondFolderId], firstFolderId, 'before');

    expect(getInvokedCommands(invoke)).toEqual(['move_nodes']);
    expectNoWorkspacePersist(invoke);
  });

  it('updateNodeReveal uses update_node_reveal only and never save_workspace_state', async () => {
    const { actions, harness, invoke, seedNodeId } = await createActionsHarness();
    const node = harness.getState().nodesById[seedNodeId];
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        [seedNodeId]: { ...node, reveal: 'Old reveal' }
      }
    });

    await actions.updateNodeReveal(seedNodeId, 'New reveal');

    expect(getInvokedCommands(invoke)).toEqual(['update_node_reveal']);
    expectNoWorkspacePersist(invoke);
  });
});
