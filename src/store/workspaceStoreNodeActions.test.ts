import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  syncCreateNodeToRuntime,
  syncNodeContentToRuntime,
  syncNodeContentWithAnchorsToRuntime,
  syncNodeOrderToRuntime,
  syncNodeRevealToRuntime
} from './workspaceRuntimeSync';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeContent through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('node-1', '# Updated title\n\nBody');

    expect(syncNodeContentWithAnchorsToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentWithAnchorsToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        content: '# Updated title\n\nBody',
        title: 'Updated title'
      }),
      [],
      expect.any(Array)
    );
  });

  it('syncs updateNodeTitle through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeTitle('node-1', '  Manual title  ');

    expect(syncNodeContentToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeContentToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        title: 'Manual title',
        isTitleManual: true
      })
    );
  });

  it('does not sync when target node does not exist', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.updateNodeContent('missing-node', 'ignored');

    expect(syncNodeContentToRuntime).not.toHaveBeenCalled();
    expect(syncNodeContentWithAnchorsToRuntime).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWorkspaceNodeActions root creation sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs createRootNode through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const createdNodeId = actions.createRootNode('# Root node');

    expect(createdNodeId).toContain('node-');
    expect(syncCreateNodeToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
    expect(syncCreateNodeToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: createdNodeId,
        kind: 'topic',
        parentNodeId: 'special-inbox',
        content: '# Root node',
        title: 'Root node'
      })
    );
  });

  it('syncs incremented Untitled title for repeated empty root node creation', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness({
      ...createWorkspaceNodeActionsFixture(),
      activeNodeId: null,
      nodeOrder: ['special-inbox'],
      nodesById: {
        'special-inbox': createWorkspaceNodeActionsFixture().nodesById['special-inbox']!
      }
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    actions.createRootNode();
    const secondNodeId = actions.createRootNode();

    expect(syncCreateNodeToRuntime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: secondNodeId,
        title: 'Untitled 1'
      })
    );
  });

  it('treats a missing Inbox as a workspace invariant violation', () => {
    const fixture = createWorkspaceNodeActionsFixture();
    const nodesById = { ...fixture.nodesById };
    delete nodesById[INBOX_NODE_ID];
    const harness = createWorkspaceNodeActionsSetStateHarness({
      ...fixture,
      nodeOrder: fixture.nodeOrder.filter((nodeId) => nodeId !== INBOX_NODE_ID),
      nodesById
    });
    const actions = createWorkspaceNodeActions(harness.setState);

    expect(() => actions.createRootNode('# Root node')).toThrow('Inbox node is missing');
    expect(syncCreateNodeToRuntime).not.toHaveBeenCalled();
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
  });
});

describe('createWorkspaceNodeActions reveal sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs updateNodeReveal through runtime command bridge', () => {
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

    actions.updateNodeReveal('node-1', 'New reveal');

    expect(syncNodeRevealToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeRevealToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node-1',
        reveal: 'New reveal'
      })
    );
  });
});

describe('createWorkspaceNodeActions create sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs createChildNode through runtime command bridge', () => {
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const childNodeId = actions.createChildNode('node-1', 'Child body');

    expect(childNodeId).toContain('node-');
    expect(syncCreateNodeToRuntime).toHaveBeenCalledTimes(1);
    expect(syncNodeOrderToRuntime).not.toHaveBeenCalled();
    expect(syncCreateNodeToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        id: childNodeId,
        kind: 'topic',
        parentNodeId: 'node-1',
        content: 'Child body'
      })
    );
  });

  it('assigns new item review due to the next local day slot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T08:00:00.000Z'));
    const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
    const actions = createWorkspaceNodeActions(harness.setState);

    const childNodeId = actions.createChildNode('node-1', 'Prompt', 'item');
    const childNode = harness.getState().nodesById[childNodeId];

    expect(childNode?.review).toEqual(expect.objectContaining({
      due: new Date(2026, 4, 22).toISOString(),
      lastReviewAt: null,
      reps: 0,
      state: 0
    }));
    expect(syncCreateNodeToRuntime).toHaveBeenCalledWith(expect.objectContaining({
      id: childNodeId,
      kind: 'item',
      review: expect.objectContaining({ due: new Date(2026, 4, 22).toISOString() })
    }));
  });

});
