import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { renderWithLocalization } from '../../shared/localization/testLocalization';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';

function createTopic(id: string, title: string) {
  return {
    anchorLink: null,
    content: 'Body',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: true,
    hasReveal: false,
    id,
    kind: 'topic' as const,
    parentNodeId: 'folder-a',
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function createFolder(manualChildOrder: string[] | null) {
  return {
    anchorLink: null,
    content: '',
    createdAt: '2026-04-20T00:00:00.000Z',
    hasContent: false,
    hasReveal: false,
    id: 'folder-a',
    kind: 'folder' as const,
    manualChildOrder,
    parentNodeId: null,
    reveal: null,
    review: null,
    title: 'Folder A',
    updatedAt: '2026-04-20T00:00:00.000Z'
  };
}

function chooseManualSort() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.keyDown(within(itemColumn).getByRole('button', { name: 'Sort list by Date modified' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manual' }));
}

function rowTitles() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  return within(itemColumn).getAllByRole('treeitem').map((row) => row.textContent);
}

function createDragTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format, value)
  };
}

function mockRowFrame(row: HTMLElement) {
  const frame = row.parentElement;
  if (!frame) {
    throw new Error('Expected topic row frame.');
  }
  frame.getBoundingClientRect = () => ({
    bottom: 100,
    height: 100,
    left: 0,
    right: 240,
    toJSON: () => undefined,
    top: 0,
    width: 240,
    x: 0,
    y: 0
  });
  return frame;
}

function dispatchDragOverBefore(target: HTMLElement, dataTransfer: ReturnType<typeof createDragTransfer>) {
  const event = createEvent.dragOver(target, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: -1 });
  fireEvent(target, event);
}

function dispatchDropBefore(target: HTMLElement, dataTransfer: ReturnType<typeof createDragTransfer>) {
  const event = createEvent.drop(target, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: -1 });
  fireEvent(target, event);
}

function dispatchDragLeave(target: HTMLElement, dataTransfer: ReturnType<typeof createDragTransfer>) {
  const event = createEvent.dragLeave(target, { dataTransfer });
  fireEvent(target, event);
}

function ManualTopicTreeHarness() {
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const itemIds = Object.values(nodesById)
    .filter((node) => node.parentNodeId === 'folder-a')
    .map((node) => node.id);
  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-a"
      itemIds={itemIds}
      nodesById={toWorkspaceListNodesById(nodesById)}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {},
    trashedNodeIds: []
  }));
});

it('uses folder manual topic order in the current folder tree', () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-a"
      itemIds={['topic-a', 'topic-b', 'topic-c']}
      nodesById={toWorkspaceListNodesById({
        'folder-a': createFolder(['topic-b']),
        'topic-a': createTopic('topic-a', 'Alpha'),
        'topic-b': createTopic('topic-b', 'Beta'),
        'topic-c': createTopic('topic-c', 'Gamma')
      })}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  chooseManualSort();

  expect(rowTitles()).toEqual(['Beta', 'Alpha', 'Gamma']);
});

it('falls back to name order before the current folder has manual topic order', () => {
  renderWithLocalization(
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId="topic-b"
      itemIds={['topic-b', 'topic-a']}
      nodesById={toWorkspaceListNodesById({
        'folder-a': createFolder(null),
        'topic-a': createTopic('topic-a', 'Alpha'),
        'topic-b': createTopic('topic-b', 'Beta')
      })}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );

  chooseManualSort();

  expect(rowTitles()).toEqual(['Alpha', 'Beta']);
});

it('writes manual topic order when dragging within the current folder', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodesById: {
      ...state.nodesById,
      'folder-a': createFolder(['topic-b', 'topic-a']),
      'topic-a': createTopic('topic-a', 'Alpha'),
      'topic-b': createTopic('topic-b', 'Beta')
    }
  }));
  renderWithLocalization(<ManualTopicTreeHarness />);
  chooseManualSort();
  const transfer = createDragTransfer();

  expect(rowTitles()).toEqual(['Beta', 'Alpha']);

  const targetFrame = mockRowFrame(screen.getByRole('treeitem', { name: 'Beta' }));
  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer: transfer });
  dispatchDragOverBefore(targetFrame, transfer);
  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Beta' }).parentElement).toHaveClass('border-t-2');
  });
  dispatchDropBefore(targetFrame, transfer);

  await waitFor(() => expect(rowTitles()).toEqual(['Alpha', 'Beta']));
  expect(useWorkspaceStore.getState().nodesById['folder-a']?.manualChildOrder).toEqual(['topic-a', 'topic-b']);
});

it('clears the drop marker when a dragged topic leaves the target row', async () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodesById: {
      ...state.nodesById,
      'folder-a': createFolder(['topic-b', 'topic-a']),
      'topic-a': createTopic('topic-a', 'Alpha'),
      'topic-b': createTopic('topic-b', 'Beta')
    }
  }));
  renderWithLocalization(<ManualTopicTreeHarness />);
  chooseManualSort();
  const transfer = createDragTransfer();
  const targetFrame = mockRowFrame(screen.getByRole('treeitem', { name: 'Beta' }));

  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer: transfer });
  dispatchDragOverBefore(targetFrame, transfer);
  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Beta' }).parentElement).toHaveClass('border-t-2');
  });
  dispatchDragLeave(targetFrame, transfer);

  await waitFor(() => {
    expect(screen.getByRole('treeitem', { name: 'Beta' }).parentElement).not.toHaveClass('border-t-2');
  });
});
