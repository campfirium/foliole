import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

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
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
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

async function runKeepsParentActiveForTextAnnotationChildrenCase() {
  const { actions, harness, invoke, seedNodeId } = await createActionsHarness();

  const highlightId = await actions.createHighlightNodeFromSelection(seedNodeId, 'Highlighted', 'hl-1', {
    id: 'hl-1',
    kind: 'highlight',
    locator: { from: 0, originalText: 'Highlighted', to: 11 }
  });
  const clozeId = await actions.createQANodeFromSelection(seedNodeId, 'Question [...]', 'answer', 'cloze-1', {
    id: 'cloze-1',
    kind: 'cloze',
    locator: { from: 12, originalText: 'answer', to: 18 }
  });

  expect(highlightId).toBeTruthy();
  expect(clozeId).toBeTruthy();
  expect(harness.getState().activeNodeId).toBe(seedNodeId);
  expect(invoke).toHaveBeenNthCalledWith(1, 'create_topic', expect.objectContaining({
    activeNodeId: seedNodeId,
    nodeId: highlightId
  }));
  expect(invoke).toHaveBeenNthCalledWith(2, 'create_item', expect.objectContaining({
    activeNodeId: seedNodeId,
    nodeId: clozeId
  }));
  expectNoWorkspacePersist(invoke);
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

  it('keeps the parent active when creating text annotation children', runKeepsParentActiveForTextAnnotationChildrenCase);

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
