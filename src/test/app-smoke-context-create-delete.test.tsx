import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode } from './app-smoke.shared';

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

it('creates highlight node without leaving current node', () => {
  render(<App />);
  let createdNodeId: string | null = null;
  act(() => {
    createdNodeId = useWorkspaceStore
      .getState()
      .createHighlightNodeFromSelection('node-1', 'Welcome', 'hl-1', createTextAnchorLink('hl-1', 'Welcome'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.activeNodeId).toBe('node-1');
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) {
    throw new Error('expected a child node');
  }
  expect(workspace.nodesById[createdNodeId]?.parentNodeId).toBe('node-1');
  expect(workspace.nodesById[createdNodeId]?.title).toBe('Welcome');
  expect(workspace.nodesById[createdNodeId]?.content).toBe('Welcome');
  expect(screen.getByRole('treeitem', { name: 'Welcome to Foliole' })).toHaveAttribute(
    'data-node-derived',
    'false'
  );
  expect(screen.getByRole('treeitem', { name: 'Welcome' })).toHaveAttribute(
    'data-node-derived',
    'true'
  );
});

it('keeps derived node icons at normal tone while lowering row emphasis', () => {
  render(<App />);
  let createdNodeId: string | null = null;
  act(() => {
    createdNodeId = useWorkspaceStore
      .getState()
      .createHighlightNodeFromSelection('node-1', 'Welcome', 'hl-1', createTextAnchorLink('hl-1', 'Welcome'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));

  const regularRow = screen.getByRole('treeitem', { name: 'Welcome to Foliole' });
  const derivedRow = screen.getByRole('treeitem', { name: 'Welcome' });

  expect(regularRow).toHaveAttribute('data-node-emphasis', 'primary');
  expect(createdNodeId).toBeTruthy();
  expect(derivedRow).toHaveAttribute('data-node-emphasis', 'secondary');
  expect(regularRow.className).toContain('font-bold');
  expect(derivedRow.className).toContain('font-normal');
  expect(regularRow.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-tone',
    'normal'
  );
  expect(derivedRow.querySelector('[data-node-icon="leaf"]')).toHaveAttribute(
    'data-node-icon-tone',
    'normal'
  );
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
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({ id: 'node-2', parentNodeId: 'node-1', title: 'Child', content: '# Child' })
    }
  }));

  render(<App />);
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Child' }), {
    clientX: 56,
    clientY: 64
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

  const workspace = useWorkspaceStore.getState();
  expect(workspace.nodesById['node-2']).toBeDefined();
  expect(workspace.trashedNodeIds).toContain('node-2');
  expect(workspace.activeNodeId).toBe('node-1');
});

it('deletes all selected nodes from node-list context menu', () => {
  vi.useFakeTimers();
  try {
    useWorkspaceStore.setState((state) => ({
      activeNodeId: 'node-1',
      nodeOrder: ['node-1', 'node-2', 'node-3'],
      nodesById: {
        ...state.nodesById,
        'node-2': createNode({ id: 'node-2', title: 'Node 2', content: '# Node 2' }),
        'node-3': createNode({ id: 'node-3', title: 'Node 3', content: '# Node 3' })
      }
    }));

    render(<App />);
    const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
    const node2Button = within(nodePanel).getByRole('treeitem', { name: 'Node 2' });
    const node3Button = within(nodePanel).getByRole('treeitem', { name: 'Node 3' });

    fireEvent.click(node2Button);
    fireEvent.click(node3Button, { ctrlKey: true });
    fireEvent.contextMenu(node3Button, { clientX: 56, clientY: 64 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByText('Deleting 2 nodes…')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersToNextTimer();
    });

    const workspace = useWorkspaceStore.getState();
    expect(workspace.trashedNodeIds).toEqual(expect.arrayContaining(['node-2', 'node-3']));
    expect(workspace.nodeOrder).toEqual(['node-1', 'node-2', 'node-3']);
    expect(workspace.activeNodeId).toBe('node-1');
  } finally {
    vi.useRealTimers();
  }
});

it('marks in-progress import actions on ordinary node context menus', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-article',
    nodeOrder: ['node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);
  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });

  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Article node' }), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.getByRole('menuitem', { name: 'Merge Highlights' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Paste here *' })).toBeInTheDocument();
});

it('hides import actions on derived node context menus', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-article',
    nodeOrder: ['node-article'],
    nodesById: {
      ...state.nodesById,
      'node-article': createNode({ id: 'node-article', kind: 'topic', title: 'Article node', content: '# Article body' })
    }
  }));
  render(<App />);
  act(() => {
    useWorkspaceStore
      .getState()
      .createHighlightNodeFromSelection('node-article', 'Welcome', 'hl-1', createTextAnchorLink('hl-1', 'Welcome'));
  });

  const nodePanel = screen.getByRole('complementary', { name: 'Node list panel' });
  fireEvent.click(within(nodePanel).getByRole('button', { name: 'Expand all' }));
  fireEvent.contextMenu(within(nodePanel).getByRole('treeitem', { name: 'Welcome' }), {
    clientX: 56,
    clientY: 64
  });

  expect(screen.queryByRole('menuitem', { name: 'Merge Highlights' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: 'Paste here *' })).toBeNull();
});
