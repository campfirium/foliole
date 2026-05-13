import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel, getTopicListPanel } from './app-smoke.shared';

function getNodeListPanel() {
  return getCurrentFolderPanel();
}

function seedTopicInInbox(args: {
  nodeId: string;
  reading?: ReturnType<typeof createNode>['reading'];
  title: string;
  extraNode?: ReturnType<typeof createNode>;
}) {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: args.nodeId,
    nodeOrder: args.extraNode ? [INBOX_NODE_ID, args.nodeId, args.extraNode.id] : [INBOX_NODE_ID, args.nodeId],
    nodesById: {
      ...state.nodesById,
      [args.nodeId]: createNode({
        id: args.nodeId,
        parentNodeId: INBOX_NODE_ID,
        title: args.title,
        content: `# ${args.title}`,
        reading: args.reading ?? null
      }),
      ...(args.extraNode ? { [args.extraNode.id]: args.extraNode } : {})
    }
  }));
}

function openNodeMenu(name: string) {
  const panel = name === 'Inbox' ? getTopicListPanel() : getNodeListPanel();
  fireEvent.contextMenu(within(panel).getByRole('treeitem', { name }), { clientX: 56, clientY: 64 });
  return panel;
}

it('shows relearn actions for pending reading nodes and keeps the pending icon state', () => {
  seedTopicInInbox({
    nodeId: 'node-pending',
    title: 'Pending note',
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
  });

  render(<App />);

  const panel = openNodeMenu('Pending note');
  expect(screen.getByRole('menuitem', { name: 'Relearn' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Dismiss' })).toBeInTheDocument();
  expect(within(panel).getByRole('treeitem', { hidden: true, name: 'Pending note' }).querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'scheduled'
  );
});

it('returns dismissed reading nodes to pending from the node menu', () => {
  seedTopicInInbox({
    nodeId: 'node-dismissed',
    title: 'Dismissed note',
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
  });

  render(<App />);
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  const panel = openNodeMenu('Dismissed note');
  expect(screen.queryByRole('menuitem', { name: 'Dismiss' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Relearn' }));

  expect(useWorkspaceStore.getState().nodesById['node-dismissed']!?.reading).toBeNull();
  expect(within(panel).getByRole('treeitem', { name: 'Dismissed note' }).querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-state',
    'pending'
  );
});

it('creates a child node from the inbox menu', () => {
  render(<App />);
  const initialInboxChildCount = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node?.parentNodeId === INBOX_NODE_ID
  ).length;

  openNodeMenu('Inbox');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter((node) => node?.parentNodeId === INBOX_NODE_ID);
  expect(inboxChildren).toHaveLength(initialInboxChildCount + 1);
});

it('creates an inbox topic from the blank current-folder area menu', () => {
  render(<App />);
  const initialInboxChildCount = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node && node.parentNodeId === INBOX_NODE_ID
  ).length;

  const tree = within(getNodeListPanel()).getAllByRole('tree')[0]!;
  fireEvent.contextMenu(tree, { clientX: 80, clientY: 160 });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Create Topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node && node.parentNodeId === INBOX_NODE_ID
  );
  expect(inboxChildren).toHaveLength(initialInboxChildCount + 1);
});

it('creates an inbox topic from the current folder create button', () => {
  render(<App />);
  const initialInboxChildCount = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node && node.parentNodeId === INBOX_NODE_ID
  ).length;

  fireEvent.click(screen.getByRole('button', { name: 'Create topic' }));

  const inboxChildren = Object.values(useWorkspaceStore.getState().nodesById).filter(
    (node) => node && node.parentNodeId === INBOX_NODE_ID
  );
  expect(inboxChildren).toHaveLength(initialInboxChildCount + 1);
});

it('shows merge import actions on ordinary article topics', () => {
  seedTopicInInbox({
    nodeId: 'node-source',
    title: 'Source node',
    extraNode: createNode({
      id: 'node-target',
      kind: 'topic',
      parentNodeId: INBOX_NODE_ID,
      title: 'Target node',
      content: ''
    })
  });

  render(<App />);

  openNodeMenu('Source node');
  expect(screen.getByRole('menuitem', { name: 'Merge Highlights' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
});
