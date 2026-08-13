import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTextHistoryEntry } from '../features/editor/model/editorOperationHistory.testSupport';

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
  const nodeActions = createWorkspaceNodeActions(harness.setState, harness.getState);
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
    const entry = createTextHistoryEntry({
      afterContent: '# Changed title\n\nBody',
      beforeContent: '# Seed',
      nodeId: 'node-1'
    });
    historyActions.pushEditorOperationEntry(entry);
    await harness.getState().updateNodeContent('node-1', '# Changed title\n\nBody');
    const applyText = (mode: 'redo' | 'undo') => {
      const content = mode === 'undo' ? entry.beforeContent : entry.afterContent;
      void harness.getState().updateNodeContent('node-1', content, { publishLocal: true });
      return true;
    };

    expect(historyActions.undoEditorOperation({
      applyText: (_entry, mode) => applyText(mode),
      currentContent: '# Changed title\n\nBody',
      nodeId: 'node-1'
    })).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Seed',
      title: 'Seed'
    });

    expect(historyActions.redoEditorOperation({
      applyText: (_entry, mode) => applyText(mode),
      currentContent: '# Seed',
      nodeId: 'node-1'
    })).toBe(true);
    expect(harness.getState().nodesById['node-1']).toMatchObject({
      content: '# Changed title\n\nBody',
      title: 'Changed title'
    });
  });
}

function registerHistoryLocatorSyncCoverage() {
  it('recomputes text annotation locators through editor undo', async () => {
    const { harness, historyActions } = createHarness();
    const beforeContent = '# Seed Beta';
    const afterContent = 'Intro # Seed Beta';
    const highlight = {
      ...harness.getState().nodesById['node-1']!,
      anchorLink: {
        id: 'highlight-anchor',
        kind: 'highlight' as const,
        locator: { from: 7, originalText: 'Beta', to: 11 }
      },
      id: 'highlight-1',
      parentNodeId: 'node-1'
    };
    harness.setState((state) => ({
      nodeOrder: [...state.nodeOrder, highlight.id],
      nodesById: {
        ...state.nodesById,
        'node-1': { ...state.nodesById['node-1']!, content: beforeContent },
        [highlight.id]: highlight
      }
    }));
    const entry = createTextHistoryEntry({ afterContent, beforeContent, nodeId: 'node-1' });
    historyActions.pushEditorOperationEntry(entry);
    await harness.getState().updateNodeContent('node-1', afterContent);

    expect(historyActions.undoEditorOperation({
      applyText: () => {
        void harness.getState().updateNodeContent('node-1', beforeContent, { publishLocal: true });
        return true;
      },
      currentContent: afterContent,
      nodeId: 'node-1'
    })).toBe(true);
    expect(harness.getState().nodesById[highlight.id]?.anchorLink?.locator).toEqual({
      from: 7,
      originalText: 'Beta',
      to: 11
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
  registerHistoryLocatorSyncCoverage();
});
