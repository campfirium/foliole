import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

function getCurrentFolderPanel() {
  return screen.getByRole('complementary', { name: 'Current folder contents' });
}

function getTopicListPanel() {
  return screen.getByRole('complementary', { name: 'Topic list panel' });
}

function getTrashTree() {
  return screen.getByRole('tree', { name: 'Trash topics' });
}

function getTrashTreeItem(title: string) {
  return within(getTrashTree()).getByRole('treeitem', { name: new RegExp(`\\b${title}\\b`) });
}

function openTrashView() {
  fireEvent.click(within(getTopicListPanel()).getByRole('treeitem', { name: 'Trash' }));
}

it('restores and permanently deletes nodes from trash context menu actions', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child content' })
    }
  }));

  render(<App />);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Child' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  openTrashView();
  fireEvent.contextMenu(getTrashTreeItem('Child'), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
  expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-2');

  fireEvent.click(screen.getAllByRole('button', { name: 'Topics' })[0]);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Child' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  openTrashView();
  fireEvent.contextMenu(getTrashTreeItem('Child'), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));
  expect(useWorkspaceStore.getState().nodesById['node-2']).toBeUndefined();
});

it('supports multi-select permanent delete inside trash', () => {
  vi.useFakeTimers();
  try {
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Node 2', content: '# Node 2' }),
        'node-3': createNode({ id: 'node-3', parentNodeId: 'node-1', title: 'Node 3', content: '# Node 3' })
      }
    }));

    render(<App />);
    fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Node 2' }), {
      clientX: 56,
      clientY: 64
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Node 3' }), {
      clientX: 56,
      clientY: 64
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    openTrashView();
    const trashedNode2 = getTrashTreeItem('Node 2');
    const trashedNode3 = getTrashTreeItem('Node 3');
    fireEvent.click(trashedNode2);
    fireEvent.click(trashedNode3, { ctrlKey: true });
    fireEvent.contextMenu(trashedNode3, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));

    act(() => {
      vi.advanceTimersToNextTimer();
    });

    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-2']).toBeUndefined();
    expect(workspace.nodesById['node-3']).toBeUndefined();
  } finally {
    vi.useRealTimers();
  }
});

it('relearns reading nodes from the node context menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Reading node',
        content: '# Reading node',
        reading: {
          intervalDurationMs: 24 * 60 * 60 * 1000,
          intervalGrowthFactor: 1.3,
          lastHandledAt: '2026-02-24T00:00:00.000Z',
          nextAt: '2026-03-10T00:00:00.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 2,
          state: 'dismissed'
        }
      })
    }
  }));

  render(<App />);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Reading node' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relearn' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']?.reading).toBeNull();
  expect(
    buildReviewQueuePlan({
      nodeOrder: workspace.nodeOrder,
      nodesById: workspace.nodesById,
      now: '2026-02-25T00:00:00.000Z',
      trashedNodeIds: workspace.trashedNodeIds
    }).queueNodeIds
  ).toContain('node-2');
});

it('relearns review cards from the node context menu after confirmation', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Review node',
        content: 'Prompt [...]',
        reveal: 'Answer',
        review: {
          due: '2026-03-19T11:09:42.000Z',
          lastReviewAt: '2026-03-17T11:09:42.000Z',
          state: 2,
          stability: 0.21,
          difficulty: 9.49,
          elapsedDays: 3,
          scheduledDays: 2,
          reps: 10,
          lapses: 2
        }
      })
    }
  }));

  render(<App />);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Review node' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relearn' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']?.review).toBeNull();
  expect(
    buildReviewQueuePlan({
      nodeOrder: workspace.nodeOrder,
      nodesById: workspace.nodesById,
      now: '2026-03-18T00:00:00.000Z',
      trashedNodeIds: workspace.trashedNodeIds
    }).queueNodeIds
  ).toContain('node-2');
});

it('empties all trash items from trash header action', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Node 2', content: '# Node 2' })
    }
  }));

  render(<App />);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Node 2' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  openTrashView();
  fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']).toBeUndefined();
  expect(workspace.trashedNodeIds).toEqual([]);
});

it('restores the main document when leaving trash after selecting a trashed node', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Trashed child',
        content: '# Trashed child body'
      })
    }
  }));

  render(<App />);
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: 'Trashed child' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  openTrashView();
  fireEvent.click(getTrashTreeItem('Trashed child'));
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');

  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  expect(screen.getByTestId('editor-value')).toHaveValue('# Welcome to Foliole\n\nStart writing markdown here.');
});
