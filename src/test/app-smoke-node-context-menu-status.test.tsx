import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

function getNodeListPanel() {
  return screen.getByRole('complementary', { name: 'Node list panel' });
}

function openNodeMenu(name: string) {
  const panel = getNodeListPanel();
  fireEvent.contextMenu(within(panel).getByRole('treeitem', { name }), { clientX: 56, clientY: 64 });
  return panel;
}

it('shows relearn actions for pending reading nodes and keeps the pending icon state', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-pending',
    nodeOrder: ['node-pending'],
    nodesById: {
      ...state.nodesById,
      'node-pending': createNode({
        id: 'node-pending',
        title: 'Pending note',
        content: '# Pending note',
        reading: {
          intervalDurationMs: 24 * 60 * 60 * 1000,
          intervalGrowthFactor: 1.3,
          lastHandledAt: '2026-03-16T00:00:00.000Z',
          nextAt: '2026-03-17T00:00:00.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'active'
        }
      })
    }
  }));

  render(<App />);

  openNodeMenu('Pending note');
  expect(screen.getByRole('menuitem', { name: 'Relearn' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Dismiss' })).toBeNull();
  expect(screen.getByRole('treeitem', { hidden: true, name: 'Pending note' }).querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'pending'
  );
});

it('returns dismissed reading nodes to pending from the node menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-dismissed',
    nodeOrder: ['node-dismissed'],
    nodesById: {
      ...state.nodesById,
      'node-dismissed': createNode({
        id: 'node-dismissed',
        title: 'Dismissed note',
        content: '# Dismissed note',
        reading: {
          intervalDurationMs: 24 * 60 * 60 * 1000,
          intervalGrowthFactor: 1.3,
          lastHandledAt: '2026-03-16T00:00:00.000Z',
          nextAt: '2026-03-17T00:00:00.000Z',
          priority: 5,
          readingPosition: 0,
          repetitionCount: 1,
          state: 'dismissed'
        }
      })
    }
  }));

  render(<App />);
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  const panel = openNodeMenu('Dismissed note');
  expect(screen.queryByRole('menuitem', { name: 'Dismiss' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relearn' }));

  expect(useWorkspaceStore.getState().nodesById['node-dismissed']?.reading).toBeNull();
  expect(within(panel).getByRole('treeitem', { name: 'Dismissed note' }).querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'pending'
  );
});

it('creates a child node from the inbox menu', () => {
  render(<App />);

  openNodeMenu('Inbox');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter((node) => node?.parentNodeId === INBOX_NODE_ID);
  expect(inboxChildren).toHaveLength(1);
});

it('creates an inbox child from the blank node-list area menu', () => {
  render(<App />);
  const initialInboxCount = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node?.parentNodeId === INBOX_NODE_ID
  ).length;

  const tree = within(getNodeListPanel()).getByRole('tree');
  fireEvent.contextMenu(tree, { clientX: 80, clientY: 160 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node?.parentNodeId === INBOX_NODE_ID
  );
  expect(inboxChildren).toHaveLength(initialInboxCount + 1);
});

it('creates an inbox child from the global new button', () => {
  render(<App />);
  const initialInboxCount = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node?.parentNodeId === INBOX_NODE_ID
  ).length;

  fireEvent.keyDown(screen.getByRole('button', { name: 'Create' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node?.parentNodeId === INBOX_NODE_ID
  );
  expect(inboxChildren).toHaveLength(initialInboxCount + 1);
});

it('keeps node menus focused on relearn and import actions for ordinary notes', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-source',
    nodeOrder: ['node-source', 'node-target'],
    nodesById: {
      ...state.nodesById,
      'node-source': createNode({ id: 'node-source', title: 'Source node', content: 'Move me' }),
      'node-target': createNode({ id: 'node-target', title: 'Target node', content: '' })
    }
  }));

  render(<App />);

  openNodeMenu('Source node');
  expect(screen.getByRole('menuitem', { name: 'Relearn' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Import here *' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here *' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Move to' })).toBeNull();
});
