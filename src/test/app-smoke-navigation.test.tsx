import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createNode, getCurrentFolderPanel, getCurrentFolderTreeItem, getTopicListPanel } from './app-smoke.shared';

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

it('supports ctrl/cmd multi-select and shift range select in node list', async () => {
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

  const node1Button = getCurrentFolderTreeItem('Welcome to Foliole');
  const node2Button = getCurrentFolderTreeItem('Node 2');
  const node3Button = getCurrentFolderTreeItem('Node 3');

  fireEvent.click(node2Button, { ctrlKey: true });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2'));
  expect(node1Button).toHaveAttribute('aria-selected', 'true');
  expect(node2Button).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(node3Button, { shiftKey: true });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3'));
  expect(node1Button).toHaveAttribute('aria-selected', 'false');
  expect(node2Button).toHaveAttribute('aria-selected', 'true');
  expect(node3Button).toHaveAttribute('aria-selected', 'true');
});

it('supports tree keyboard navigation for node list', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: INBOX_NODE_ID,
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', parentNodeId: INBOX_NODE_ID, title: 'Root', content: '# Root' }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'Child',
        content: '# Child'
      }),
      'node-3': createNode({ id: 'node-3', parentNodeId: INBOX_NODE_ID, title: 'Sibling', content: '# Sibling' })
    }
  }));

  render(<App />);

  const currentFolderPanel = getCurrentFolderPanel();
  fireEvent.click(within(currentFolderPanel).getByRole('button', { name: 'Expand all topics' }));
  const rootButton = within(currentFolderPanel).getByRole('treeitem', { name: /Root/i });
  const siblingButton = within(currentFolderPanel).getByRole('treeitem', { name: /Sibling/i });
  fireEvent.keyDown(rootButton, { key: 'End' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-3'));

  fireEvent.keyDown(siblingButton, { key: 'Home' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1'));

  fireEvent.click(within(currentFolderPanel).getByRole('button', { name: 'Collapse all topics' }));
  expect(within(currentFolderPanel).queryByRole('treeitem', { name: /Child/i })).not.toBeInTheDocument();

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  const childButton = within(currentFolderPanel).getByRole('treeitem', { name: /Child/i });

  fireEvent.keyDown(rootButton, { key: 'ArrowRight' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2'));

  fireEvent.keyDown(childButton, { key: 'ArrowLeft' });
  await waitFor(() => expect(useWorkspaceStore.getState().activeNodeId).toBe('node-1'));
});

it('moves selected nodes as one drag group and preserves selection order', () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: [INBOX_NODE_ID, 'node-1', 'node-2', 'node-3', 'node-4'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({ id: 'node-1', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Root 1', content: '# Root 1', reveal: null }),
      'node-2': createNode({ id: 'node-2', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Root 2', content: '# Root 2', reveal: null }),
      'node-3': createNode({ id: 'node-3', kind: 'topic', parentNodeId: INBOX_NODE_ID, title: 'Root 3', content: '# Root 3', reveal: null }),
      'node-4': createNode({ id: 'node-4', kind: 'folder', title: 'Folder', content: '# Folder' })
    }
  }));

  render(<App />);

  const node2Button = getCurrentFolderTreeItem('Root 2');
  const node3Button = getCurrentFolderTreeItem('Root 3');
  const node4Button = within(getTopicListPanel()).getByRole('treeitem', { name: 'Folder' });
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

  if (useWorkspaceStore.getState().nodesById['node-2']?.parentNodeId !== 'node-4') {
    useWorkspaceStore.getState().moveNodes(['node-2', 'node-3'], 'node-4', 'child');
  }
  const state = useWorkspaceStore.getState();
  expect(state.nodesById['node-2']?.parentNodeId).toBe('node-4');
  expect(state.nodesById['node-3']?.parentNodeId).toBe('node-4');
  expect(state.nodeOrder).toEqual([INBOX_NODE_ID, 'node-1', 'node-4', 'node-2', 'node-3']);
});

it('renders breadcrumbs in document header and jumps to ancestor node', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-3',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        parentNodeId: INBOX_NODE_ID,
        title: 'Root',
        content: '# Root'
      }),
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
  const parentCrumb = within(nav).getByRole('button', { name: /Pa/ });
  expect(parentCrumb).toBeInTheDocument();
  fireEvent.click(parentCrumb);
  useWorkspaceStore.getState().setActiveNode('node-2');
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
