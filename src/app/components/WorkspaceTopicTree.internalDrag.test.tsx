import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';

import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { WorkspaceTopicTree } from './WorkspaceTopicTree';
import { filterMovableTopicTreeSelection } from './workspaceTopicTreeDrag';

interface TopicOverrides {
  anchorLink?: { id: string; kind: 'highlight' | 'cloze' } | null;
}

function topic(id: string, title: string, overrides: TopicOverrides = {}) {
  return {
    anchorLink: overrides.anchorLink ?? null,
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

function folder(manualChildOrder: string[] | null) {
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

function transfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'move',
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format, value)
  };
}

function chooseManualSort() {
  const itemColumn = screen.getByRole('complementary', { name: 'Current folder contents' });
  fireEvent.keyDown(within(itemColumn).getByRole('button', { name: 'Sort list by Date modified' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Manual' }));
}

function rowFrame(name: string) {
  const frame = screen.getByRole('treeitem', { name }).parentElement;
  if (!frame) throw new Error('Expected topic row frame.');
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

function dragAt(target: HTMLElement, dataTransfer: ReturnType<typeof transfer>, clientY: number, altKey = false) {
  const event = createEvent.dragOver(target, { dataTransfer });
  Object.defineProperty(event, 'altKey', { value: altKey });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(target, event);
}

function dropAt(target: HTMLElement, dataTransfer: ReturnType<typeof transfer>, clientY: number, altKey = false) {
  const event = createEvent.drop(target, { dataTransfer });
  Object.defineProperty(event, 'altKey', { value: altKey });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(target, event);
}

function TopicTreeHarness(props: { activeNodeId?: string | null }) {
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const itemIds = Object.values(nodesById)
    .filter((node) => node.parentNodeId === 'folder-a')
    .map((node) => node.id);
  return (
    <WorkspaceTopicTree
      activeFolderId="folder-a"
      activeNodeId={props.activeNodeId ?? 'topic-a'}
      itemIds={itemIds}
      nodesById={toWorkspaceListNodesById(nodesById)}
      onOpenMoveToNode={() => undefined}
      onSelectNode={() => undefined}
    />
  );
}

function seed(order: string[], manualChildOrder: string[], includeDerived = false) {
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeOrder: order,
    nodesById: {
      ...state.nodesById,
      'folder-a': folder(manualChildOrder),
      'topic-a': topic('topic-a', 'Alpha'),
      'topic-b': topic('topic-b', 'Beta'),
      ...(includeDerived
        ? { 'topic-derived': topic('topic-derived', 'Derived', { anchorLink: { id: 'anchor-1', kind: 'highlight' } }) }
        : {})
    }
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState((state) => ({
    ...state,
    nodeViewById: {},
    trashedNodeIds: []
  }));
});

it('does not apply topic-to-topic drops outside manual sorting', () => {
  seed(['folder-a', 'topic-a', 'topic-b'], ['topic-a', 'topic-b']);
  render(<TopicTreeHarness />);
  const dataTransfer = transfer();
  const alphaFrame = rowFrame('Alpha');
  const betaFrame = rowFrame('Beta');

  fireEvent.dragStart(alphaFrame, { dataTransfer });
  dragAt(betaFrame, dataTransfer, 50);
  dropAt(betaFrame, dataTransfer, 50);

  expect(alphaFrame).toHaveAttribute('draggable', 'true');
  expect(betaFrame).not.toHaveClass('border');
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(['folder-a', 'topic-a', 'topic-b']);
  expect(useWorkspaceStore.getState().nodesById['topic-a']?.parentNodeId).toBe('folder-a');
  expect(useWorkspaceStore.getState().nodesById['topic-b']?.parentNodeId).toBe('folder-a');
});

it('does not fall back to structural movement for manual child drops', () => {
  seed(['folder-a', 'topic-a', 'topic-b'], ['topic-b', 'topic-a']);
  render(<TopicTreeHarness />);
  chooseManualSort();
  const dataTransfer = transfer();
  const betaFrame = rowFrame('Beta');

  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer });
  dragAt(betaFrame, dataTransfer, 50);
  dropAt(betaFrame, dataTransfer, 50);

  expect(betaFrame).not.toHaveClass('border');
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(['folder-a', 'topic-a', 'topic-b']);
  expect(useWorkspaceStore.getState().nodesById['folder-a']?.manualChildOrder).toEqual(['topic-a', 'topic-b']);
  expect(useWorkspaceStore.getState().nodesById['topic-a']?.parentNodeId).toBe('folder-a');
  expect(useWorkspaceStore.getState().nodesById['topic-b']?.parentNodeId).toBe('folder-a');
});

it('shows Alt structural drop feedback for movable topics', async () => {
  seed(['folder-a', 'topic-a', 'topic-b'], ['topic-a', 'topic-b']);
  render(<TopicTreeHarness />);
  const dataTransfer = transfer();
  const betaFrame = rowFrame('Beta');

  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer });
  dragAt(betaFrame, dataTransfer, 50, true);

  await waitFor(() => expect(betaFrame).toHaveClass('border'));
});

it('keeps derived topics as manual sort anchors but not drag sources', () => {
  seed(['folder-a', 'topic-a', 'topic-b', 'topic-derived'], ['topic-derived', 'topic-b', 'topic-a'], true);
  render(<TopicTreeHarness />);
  chooseManualSort();
  const dataTransfer = transfer();

  expect(rowFrame('Alpha')).toHaveAttribute('draggable', 'true');
  expect(rowFrame('Derived')).toHaveAttribute('draggable', 'false');

  const derivedFrame = rowFrame('Derived');
  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer });
  dragAt(derivedFrame, dataTransfer, 50);
  dropAt(derivedFrame, dataTransfer, 50);

  expect(derivedFrame).not.toHaveClass('border');
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(['folder-a', 'topic-a', 'topic-b', 'topic-derived']);
  expect(useWorkspaceStore.getState().nodesById['folder-a']?.manualChildOrder).toEqual(['topic-derived', 'topic-b', 'topic-a']);
  expect(useWorkspaceStore.getState().nodesById['topic-derived']?.parentNodeId).toBe('folder-a');
});

it('does not apply Alt child drops into derived topics', () => {
  seed(['folder-a', 'topic-a', 'topic-b', 'topic-derived'], ['topic-derived', 'topic-b', 'topic-a'], true);
  render(<TopicTreeHarness />);
  const dataTransfer = transfer();
  const derivedFrame = rowFrame('Derived');

  fireEvent.dragStart(screen.getByRole('treeitem', { name: 'Alpha' }), { dataTransfer });
  dragAt(derivedFrame, dataTransfer, 50, true);
  dropAt(derivedFrame, dataTransfer, 50, true);

  expect(derivedFrame).not.toHaveClass('border');
  expect(useWorkspaceStore.getState().nodesById['topic-a']?.parentNodeId).toBe('folder-a');
});

it('excludes derived topics from mixed manual drag selections', () => {
  seed(['folder-a', 'topic-derived', 'topic-b', 'topic-a'], ['topic-derived', 'topic-b', 'topic-a'], true);

  expect(filterMovableTopicTreeSelection(
    ['topic-derived', 'topic-b'],
    toWorkspaceListNodesById(useWorkspaceStore.getState().nodesById)
  )).toEqual(['topic-b']);
});
