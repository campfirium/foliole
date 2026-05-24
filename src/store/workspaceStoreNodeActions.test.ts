import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  syncCreateNodeMutationToRuntime,
  syncNodeContentMutationToRuntime,
  syncNodeContentToRuntime,
  syncNodeContentWithAnchorsMutationToRuntime,
  syncNodeContentWithAnchorsToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealMutationToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

describe('createWorkspaceNodeActions content/title sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeContent through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('node-1', '# Updated title\n\nBody');

    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentWithAnchorsMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        content: '# Updated title\n\nBody',
        title: 'Updated title'
      }),
      [],
      expect.any(Array)
    );
  });

  it('syncs updateNodeTitle through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeTitle('node-1', '  Manual title  ');

    expect(syncNodeContentMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        title: 'Manual title',
        isTitleManual: true
      })
    );
  });

  it('does not sync when target node does not exist', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    await actions.updateNodeContent('missing-node', 'ignored');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentMutationToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsMutationToRuntime).not.toHaveBeenCalled();
  });

});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWorkspaceNodeActions root creation sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('syncs createRootNode through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createdNodeId = (await actions.createRootNode('# Root node'))!;

    expect(createdNodeId).toContain('node-');
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdNodeId,
        kind: 'topic',
        parentNodeId: 'special-inbox',
        content: '# Root node',
        title: 'Root node'
      }),
      expect.any(Array),
      createdNodeId,
      expect.any(Number)
    );
  });

  it('syncs incremented Untitled title for repeated empty root node creation', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness({
      ...createWorkspaceNodeActionsFixture(),
      activeNodeId: null,
      nodeOrder: ['special-inbox'],
      nodesById: {
        'special-inbox': createWorkspaceNodeActionsFixture().nodesById['special-inbox']!
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    (await actions.createRootNode())!;
    const secondNodeId = (await actions.createRootNode())!;

    expect(syncCreateNodeMutationToRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: secondNodeId,
        title: 'Untitled 1'
      }),
      expect.any(Array),
      secondNodeId,
      expect.any(Number)
    );
  });

});

it('treats a missing Inbox as a workspace invariant violation', async () => {
  vi.clearAllMocks();
  const fixture = createWorkspaceNodeActionsFixture();
  const nodesById = { ...fixture.nodesById };
  delete nodesById[INBOX_NODE_ID];
  const harness = createWorkspaceNodeActionsSetStateHarness({
    ...fixture,
    nodeOrder: fixture.nodeOrder.filter((nodeId) => nodeId !== INBOX_NODE_ID),
    nodesById
  });
  const actions = createWorkspaceNodeActions(harness.setState);

  await expect(actions.createRootNode('# Root node')).rejects.toThrow('Inbox node is missing');
  expect(syncCreateNodeMutationToRuntime).not.toHaveBeenCalled();
  expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
});

describe('createWorkspaceNodeActions reveal sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeReveal through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);
    const state = harness.getState();
    const node = state.nodesById['node-1']!;
    if (!node) {
      throw new Error('missing seed node');
    }
    harness.setState({
      nodesById: {
        ...state.nodesById,
        'node-1': {
          ...node,
          reveal: 'Old reveal'
        }
      }
    });

    await actions.updateNodeReveal('node-1', 'New reveal');

    expect(syncNodeRevealMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeRevealMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        reveal: 'New reveal'
      })
    );
  });
});

describe('createWorkspaceNodeActions create sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('syncs createChildNode through runtime command bridge', async () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const childNodeId = (await actions.createChildNode('node-1', 'Child body'))!;

    expect(childNodeId).toContain('node-');
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: childNodeId,
        kind: 'topic',
        parentNodeId: 'node-1',
        content: 'Child body'
      }),
      expect.any(Array),
      childNodeId,
      expect.any(Number)
    );
  });

  it('assigns new item review due to the next local day slot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const childNodeId = (await actions.createChildNode('node-1', 'Prompt', 'item'))!;
    const childNode = harness.getState().nodesById[childNodeId];

    expect(childNode?.review).toEqual(expect.objectContaining({
      due: new Date(2026, 4, 22).toISOString(),
      lastReviewAt: null,
      reps: 0,
      state: 0
    }));
    expect(syncCreateNodeMutationToRuntime).toHaveBeenCalledWith(expect.objectContaining({
      id: childNodeId,
      kind: 'item',
      review: expect.objectContaining({ due: new Date(2026, 4, 22).toISOString() })
    }), expect.any(Array), childNodeId, expect.any(Number));
  });

});
