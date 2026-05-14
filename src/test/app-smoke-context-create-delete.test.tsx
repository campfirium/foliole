import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel, getCurrentFolderTreeItem } from './app-smoke.shared';

function createTextAnchorLink(id: string, originalText: string, from = 0) {
  return {
    id,
    kind: 'highlight' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

function createTextClozeAnchorLink(id: string, originalText: string, from = 0) {
  return {
    id,
    kind: 'cloze' as const,
    locator: {
      from,
      originalText,
      to: from + originalText.length
    }
  };
}

it('renders ordinary child rows with normal weight', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child' })
    }
  }));

  render(<App />);
  fireEvent.click(within(getCurrentFolderPanel()).getByRole('button', { name: 'Expand all topics' }));

  const topLevelRow = getCurrentFolderTreeItem('Welcome to Foliole');
  const childRow = getCurrentFolderTreeItem('Child');

  expect(topLevelRow.className).toContain('font-normal');
  expect(childRow.className).toContain('font-normal');
});

it('creates cloze node without leaving current node', () => {
  render(<App />);
  let createdNodeId: string | null = null;
  act(() => {
    createdNodeId = useWorkspaceStore
      .getState()
      .createQANodeFromSelection('node-1', '[...] to Foliole', 'Welcome', 'cloze-1', createTextClozeAnchorLink('cloze-1', 'Welcome'));
  });

  const workspace = useWorkspaceStore.getState();
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
  expect(workspace.nodesById[createdNodeId]?.title).toBe('[...] to Foliole');
  expect(workspace.nodesById[createdNodeId]?.reveal).toBe('Welcome');
});

it('creates cloze child content from pure markdown parent content', () => {
  useWorkspaceStore
    .getState()
    .updateNodeContent('node-1', '# A B C');

  render(<App />);
  let createdNodeId: string | null = null;
  act(() => {
    createdNodeId = useWorkspaceStore
      .getState()
      .createQANodeFromSelection('node-1', '# A B [...]', 'C', 'cloze-2', createTextClozeAnchorLink('cloze-2', 'C', 6));
  });

  const workspace = useWorkspaceStore.getState();
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.content).toBe('# A B [...]');
  expect(workspace.nodesById[createdNodeId]?.content).not.toContain('<highlight');
});

it('deletes a node from node-list context menu', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child' })
    }
  }));

  render(<App />);
  fireEvent.contextMenu(getCurrentFolderTreeItem('Child'), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']!).toBeDefined();
  expect(workspace.trashedNodeIds).toContain('node-2');
  expect(workspace.activeNodeId).toBe('node-1');
});

it('deletes all selected nodes from node-list context menu', () => {
  vi.useFakeTimers();
  try {
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': createNode({ id: 'node-2', parentNodeId: INBOX_NODE_ID, title: 'Node 2', content: '# Node 2' }),
        'node-3': createNode({ id: 'node-3', parentNodeId: INBOX_NODE_ID, title: 'Node 3', content: '# Node 3' })
      }
    }));

    render(<App />);
    const node2Button = getCurrentFolderTreeItem('Node 2');
    const node3Button = getCurrentFolderTreeItem('Node 3');

    fireEvent.click(node2Button);
    fireEvent.click(node3Button, { ctrlKey: true });
    fireEvent.contextMenu(node3Button, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    act(() => {
      vi.advanceTimersToNextTimer();
    });

    const workspace = useWorkspaceStore.getState();
    expect(workspace.trashedNodeIds).toEqual(expect.arrayContaining(['node-2', 'node-3']));
    expect(workspace.nodeOrder).toEqual([INBOX_NODE_ID, 'node-1', 'node-2', 'node-3']);
    expect(workspace.activeNodeId).toBe('node-1');
  } finally {
    vi.useRealTimers();
  }
});

it('marks in-progress import actions on ordinary node context menus', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-article',
    nodeOrder: [INBOX_NODE_ID, 'node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);

  fireEvent.contextMenu(getCurrentFolderTreeItem('Article node'), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.getByRole('menuitem', { name: 'Merge Highlights' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here' })).toBeInTheDocument();
});

it('hides import actions on derived node context menus', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-article',
    nodeOrder: [INBOX_NODE_ID, 'node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);
  act(() => {
    useWorkspaceStore
      .getState()
      .createHighlightNodeFromSelection('node-article', 'Welcome', 'hl-1', createTextAnchorLink('hl-1', 'Welcome'));
  });

  fireEvent.contextMenu(getCurrentFolderTreeItem('Welcome'), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.queryByRole('menuitem', { name: 'Merge Highlights' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Paste here' })).toBeNull();
});
