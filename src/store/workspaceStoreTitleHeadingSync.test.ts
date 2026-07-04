import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkspaceEditorOperationHistoryActions } from './workspaceEditorOperationHistory';
import { createWorkspaceNodeActions } from './workspaceStoreNodeActions';
import {
  createWorkspaceNodeActionsFixture,
  createWorkspaceNodeActionsSetStateHarness
} from './workspaceStoreNodeActions.test-support';

vi.mock('./workspaceRuntimeSync', () => ({
  hasWorkspaceNodeMutationRuntime: vi.fn(() => false),
  syncCreateNodeMutationToRuntime: vi.fn(async () => null),
  syncCreateNodeToRuntime: vi.fn(),
  syncDeleteNodesPermanentlyToRuntime: vi.fn(),
  syncMoveNodesToRuntime: vi.fn(async () => undefined),
  syncNodeContentMutationToRuntime: vi.fn(async () => null),
  syncNodeContentToRuntime: vi.fn(),
  syncNodeContentWithAnchorsMutationToRuntime: vi.fn(async () => null),
  syncNodeContentWithAnchorsToRuntime: vi.fn(),
  syncNodeOrderToRuntime: vi.fn(),
  syncNodeRevealMutationToRuntime: vi.fn(async () => null),
  syncNodeRevealToRuntime: vi.fn(),
  syncRestoreNodesToRuntime: vi.fn(),
  syncSoftDeleteNodesToRuntime: vi.fn()
}));

function createHarness() {
  const harness = createWorkspaceNodeActionsSetStateHarness(createWorkspaceNodeActionsFixture());
  const nodeActions = createWorkspaceNodeActions(harness.setState);
  const historyActions = createWorkspaceEditorOperationHistoryActions(harness.setState, harness.getState);
  harness.setState({ ...nodeActions, ...historyActions });
  return { harness, historyActions };
}

function registerContentTitleSyncCoverage() {
  it('syncs the node title from a unique body H1 while preserving manual-title state', async () => {
    const { harness } = createHarness();
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': { ...harness.getState().nodesById['node-1']!, isTitleManual: true }
      }
    });

    await harness.getState().updateNodeContent('node-1', '# Synced title\n\nBody');

    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Synced title\n\nBody',
      isTitleManual: true,
      title: 'Synced title'
    });
  });

  it('does not retitle from content that has no unique H1', async () => {
    const { harness } = createHarness();

    await harness.getState().updateNodeContent('node-1', 'Body without heading');
    expect(harness.getState().nodesById['node-1']?.title).toBe('Seed');

    await harness.getState().updateNodeContent('node-1', '# One\n\n# Two');
    expect(harness.getState().nodesById['node-1']?.title).toBe('Seed');
  });

}

function registerRenameTitleSyncCoverage() {
  it('rewrites an existing unique body H1 when the node title changes', async () => {
    const { harness } = createHarness();

    await harness.getState().updateNodeTitle('node-1', 'Renamed article');

    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Renamed article',
      title: 'Renamed article'
    });
  });

  it('does not create a body H1 when renaming a node without one', async () => {
    const { harness } = createHarness();
    harness.setState({
      nodesById: {
        ...harness.getState().nodesById,
        'node-1': { ...harness.getState().nodesById['node-1']!, content: 'Plain body' }
      }
    });

    await harness.getState().updateNodeTitle('node-1', 'Renamed article');

    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: 'Plain body',
      title: 'Renamed article'
    });
  });
}

function registerHistoryTitleSyncCoverage() {
  it('syncs unique H1 titles through editor undo and redo', async () => {
    const { harness, historyActions } = createHarness();
    historyActions.pushEditorOperationEntry({
      afterContent: '# Changed title\n\nBody',
      beforeContent: '# Seed',
      nodeId: 'node-1',
      title: 'Edit Text',
      type: 'text.edit'
    });
    await harness.getState().updateNodeContent('node-1', '# Changed title\n\nBody');

    expect(historyActions.undoEditorOperation()).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Seed',
      title: 'Seed'
    });

    expect(historyActions.redoEditorOperation()).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Changed title\n\nBody',
      title: 'Changed title'
    });
  });
}

describe('workspace title heading sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerContentTitleSyncCoverage();
  registerRenameTitleSyncCoverage();
  registerHistoryTitleSyncCoverage();
});
