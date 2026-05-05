import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, mockEditorState } from './app-smoke.shared';

function createTextAnchorLink(id: string, originalText: string, from: number) {
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

it('supports ctrl/cmd multi-select and shift range select in node list', () => {
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

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  const node1Button = within(listPanel).getByRole('treeitem', { name: 'Welcome to Foliole' });
  const node2Button = within(listPanel).getByRole('treeitem', { name: 'Node 2' });
  const node3Button = within(listPanel).getByRole('treeitem', { name: 'Node 3' });

  fireEvent.click(node2Button, { ctrlKey: true });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  expect(node1Button).toHaveAttribute('aria-pressed', 'true');
  expect(node2Button).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(node3Button, { shiftKey: true });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  expect(node1Button).toHaveAttribute('aria-pressed', 'false');
  expect(node2Button).toHaveAttribute('aria-pressed', 'true');
  expect(node3Button).toHaveAttribute('aria-pressed', 'true');
});

it('supports tree keyboard navigation for node list', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', title: 'Root', content: '# Root' }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Child',
        content: '# Child'
      }),
      'node-3': createNode({ id: 'node-3', title: 'Sibling', content: '# Sibling' })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  const rootButton = within(listPanel).getByRole('treeitem', { name: /Root/i });
  const siblingButton = within(listPanel).getByRole('treeitem', { name: /Sibling/i });
  fireEvent.keyDown(rootButton, { key: 'End' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');

  fireEvent.keyDown(siblingButton, { key: 'Home' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');

  fireEvent.click(within(listPanel).getByRole('button', { name: 'Collapse all' }));
  expect(within(listPanel).queryByRole('treeitem', { name: /Child/i })).not.toBeInTheDocument();

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  const childButton = within(listPanel).getByRole('treeitem', { name: /Child/i });

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');

  fireEvent.keyDown(childButton, { key: 'ArrowLeft' });
  expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1');
});

it('moves selected nodes as one drag group and preserves selection order', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', kind: 'topic', title: 'Root 1', content: '# Root 1', reveal: null }),
      'node-2': createNode({ id: 'node-2', kind: 'topic', title: 'Root 2', content: '# Root 2', reveal: null }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', title: 'Root 3', content: '# Root 3', reveal: null }),
      'node-4': createNode({ id: 'node-4', kind: 'folder', title: 'Folder', content: '# Folder' })
    }
  }));

  render(<App />);

  const listPanel = screen.getByRole('complementary', { name: 'Topic list panel' });
  const node2Button = within(listPanel).getByRole('treeitem', { name: 'Root 2' });
  const node3Button = within(listPanel).getByRole('treeitem', { name: 'Root 3' });
  const node4Button = within(listPanel).getByRole('treeitem', { name: 'Folder' });
  const dragRow = node2Button.closest('div[draggable="true"]');
  const dropRow = node4Button.closest('div[draggable="true"]');
  if (!dragRow || !dropRow) {
    throw new Error('Expected draggable rows for drag and drop test');
  }

  fireEvent.click(node2Button);
  fireEvent.click(node3Button, { ctrlKey: true });
  const dataTransfer = {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: () => '',
    setData: () => undefined
  } as unknown as DataTransfer;
  const rectSpy = vi.spyOn(dropRow, 'getBoundingClientRect').mockReturnValue({
    bottom: 100,
    height: 100,
    left: 0,
    right: 300,
    toJSON: () => ({}),
    top: 0,
    width: 300,
    x: 0,
    y: 0
  });

  fireEvent.dragStart(dragRow, { dataTransfer });
  fireEvent.dragOver(dropRow, { clientY: 50, dataTransfer });
  fireEvent.drop(dropRow, { clientY: 50, dataTransfer });
  fireEvent.dragEnd(dragRow, { dataTransfer });
  rectSpy.mockRestore();

  const state = useWorkspaceStore.getState();
  expect(state.nodesById['node-2']?.parentNodeId).toBe('node-4');
  expect(state.nodesById['node-3']?.parentNodeId).toBe('node-4');
  expect(state.nodeOrder).toEqual(['node-1', 'node-4', 'node-2', 'node-3']);
});

it('renders breadcrumbs in document header and jumps to ancestor node', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: '# Parent Needle'
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: '# Child',
        anchorLink: createTextAnchorLink('1', 'Needle', '# Parent Needle'.indexOf('Needle'))
      })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
  expect(within(nav).getByRole('button', { name: 'Parent' })).toBeInTheDocument();
  fireEvent.click(within(nav).getByRole('button', { name: 'Parent' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
});

it('supports toolbar parent and navigation history actions', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Parent',
        content: '# Parent Needle'
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Child',
        content: '# Child',
        anchorLink: createTextAnchorLink('1', 'Needle', '# Parent Needle'.indexOf('Needle'))
      })
    },
    navigation: { backStack: [], forwardStack: [] }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Go to parent' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
});

it('reveals document highlights from the right sidebar list', () => {
  const parentContent = '# Parent Needle\n\nSecond mark';
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...state.nodesById,
      'node-2': createNode({
        id: 'node-2',
        title: 'Parent',
        content: parentContent
      }),
      'node-3': createNode({
        id: 'node-3',
        parentNodeId: 'node-2',
        title: 'Needle highlight',
        content: 'Needle',
        anchorLink: createTextAnchorLink('1', 'Needle', parentContent.indexOf('Needle'))
      }),
      'node-4': createNode({
        id: 'node-4',
        parentNodeId: 'node-2',
        title: 'Second mark highlight',
        content: 'Second mark',
        anchorLink: createTextAnchorLink('2', 'Second mark', parentContent.indexOf('Second mark'))
      })
    }
  }));

  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Highlights panel' }));
  fireEvent.click(screen.getByRole('button', { name: /Second mark/i }));

  const expectedFrom = parentContent.indexOf('Second mark');
  return waitFor(() => {
    expect(mockEditorState.selectionFrom).toBe(expectedFrom);
    expect(mockEditorState.selectionTo).toBe(expectedFrom);
  });
});

it('renders the full ancestor path and abbreviates article descendants', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-7',
    nodeOrder: ['node-1', 'node-2', 'node-3', 'node-4', 'node-5', 'node-6', 'node-7'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', kind: 'folder', parentNodeId: null, title: 'Inbox', content: '' }),
      'node-2': createNode({ id: 'node-2', kind: 'topic', parentNodeId: 'node-1', title: 'Article', content: '# Article' }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', parentNodeId: 'node-2', title: '标注节点标题', content: '# Nested 1' }),
      'node-4': createNode({ id: 'node-4', kind: 'item', parentNodeId: 'node-3', title: '挖空卡片标题', content: '# Nested 2' }),
      'node-5': createNode({ id: 'node-5', kind: 'item', parentNodeId: 'node-4', title: '当前父级', content: '# Parent' }),
      'node-6': createNode({ id: 'node-6', kind: 'item', parentNodeId: 'node-5', title: '当前节点', content: '# Current' }),
      'node-7': createNode({ id: 'node-7', kind: 'item', parentNodeId: 'node-6', title: '最终节点', content: '# Final' })
    }
  }));

  render(<App />);

  const nav = screen.getByRole('navigation', { name: 'Node breadcrumbs' });
  expect(within(nav).getByRole('button', { name: 'Inbox' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: 'Article' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '标注...' })).toBeInTheDocument();
  expect(within(nav).getByRole('button', { name: '挖空...' })).toBeInTheDocument();
  expect(within(nav).getAllByRole('button', { name: '当前...' })).toHaveLength(2);
  expect(within(nav).queryByRole('button', { name: '最终节点' })).not.toBeInTheDocument();
});
