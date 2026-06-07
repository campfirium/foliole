import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { buildReviewQueuePlan } from '../store/reviewQueuePlanner';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

function getCurrentFolderPanel() {
  return screen.getByRole('complementary', { name: 'Current folder contents' });
}

async function getTrashTree() {
  return screen.findByRole('tree', { name: 'Trash topics' });
}

async function getTrashTreeItem(title: string) {
  return within(await getTrashTree()).findByRole('treeitem', { name: new RegExp(`\\b${title}\\b`) });
}

function openCurrentFolderItemContextMenu(title: string) {
  fireEvent.contextMenu(within(getCurrentFolderPanel()).getByRole('treeitem', { name: title }), {
    clientX: 56,
    clientY: 64
  });
}

async function openTrashView() {
  fireEvent.click(screen.getByRole('treeitem', { name: 'Trash' }));
  await getTrashTree();
}

it('restores and permanently deletes nodes from trash context menu actions', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: INBOX_NODE_ID, title: 'Child', content: '# Child content' })
    }
  }));

  render(<App />);
  openCurrentFolderItemContextMenu('Child');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  await openTrashView();
  fireEvent.contextMenu(await getTrashTreeItem('Child'), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
  await waitFor(() => expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('node-2'));

  fireEvent.click(screen.getAllByRole('button', { name: 'Topics' })[0]!);
  openCurrentFolderItemContextMenu('Child');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await openTrashView();
  fireEvent.contextMenu(await getTrashTreeItem('Child'), { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));
  await waitFor(() => expect(useWorkspaceStore.getState().nodesById['node-2']!).toBeUndefined());
});

it('supports multi-select permanent delete inside trash', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: INBOX_NODE_ID, title: 'Node 2', content: '# Node 2' }),
      'node-3': createNode({ id: 'node-3', parentNodeId: INBOX_NODE_ID, title: 'Node 3', content: '# Node 3' })
    }
  }));

  render(<App />);
  openCurrentFolderItemContextMenu('Node 2');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  openCurrentFolderItemContextMenu('Node 3');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  await openTrashView();
  const trashedNode2 = await getTrashTreeItem('Node 2');
  const trashedNode3 = await getTrashTreeItem('Node 3');
  fireEvent.click(trashedNode2);
  fireEvent.click(trashedNode3, { ctrlKey: true });
  fireEvent.contextMenu(trashedNode3, { clientX: 56, clientY: 64 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Permanently' }));

  await waitFor(() => {
    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-3']!).toBeUndefined();
    expect(workspace.nodesById['node-2']!).toBeUndefined();
  });
});

it('relearns reading nodes from the node context menu', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: INBOX_NODE_ID,
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
  openCurrentFolderItemContextMenu('Reading node');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Relearn' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Relearn this topic?' })).getByRole('button', { name: 'Relearn' }));

  await waitFor(() => expect(useWorkspaceStore.getState().nodesById['node-2']?.reading).toBeNull());
  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']?.reading).toBeNull();
  expect(
    buildReviewQueuePlan({
      nodeOrder: workspace.nodeOrder,
      nodesById: workspace.nodesById,
      now: '2026-02-25T00:00:00.000Z',
      trashedNodeIds: workspace.trashedNodeIds
    }).queueNodeIds
  ).not.toContain('node-2');
});

it('relearns review cards from the node context menu after confirmation', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: INBOX_NODE_ID,
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
  openCurrentFolderItemContextMenu('Review node');
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Relearn' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Relearn this topic?' })).getByRole('button', { name: 'Relearn' }));

  await waitFor(() => expect(useWorkspaceStore.getState().nodesById['node-2']?.review).toBeNull());
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

it('empties all trash items from trash header action', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: INBOX_NODE_ID, title: 'Node 2', content: '# Node 2' })
    }
  }));

  render(<App />);
  openCurrentFolderItemContextMenu('Node 2');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  await openTrashView();
  fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }));

  await waitFor(() => {
    const workspace = useWorkspaceStore.getState();
    expect(workspace.nodesById['node-1']!).toBeDefined();
    expect(workspace.nodesById['node-2']!).toBeUndefined();
    expect(workspace.trashedNodeIds).toEqual([]);
  });
});

it('restores the main document when leaving trash after selecting a trashed node', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: INBOX_NODE_ID,
        title: 'Trashed child',
        content: '# Trashed child body'
      })
    }
  }));

  render(<App />);
  openCurrentFolderItemContextMenu('Trashed child');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  await openTrashView();
  fireEvent.click(await getTrashTreeItem('Trashed child'));
  expect(useWorkspaceStore.getState().activeNodeId).toBe(INBOX_NODE_ID);

  fireEvent.click(screen.getByRole('treeitem', { name: 'Inbox' }));
  expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
});
