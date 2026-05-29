import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { VirtualResultListPanel } from './VirtualResultListPanel';

function createNode(id: string, title: string): Node {
  return {
    content: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    id,
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    review: null,
    title,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useWorkspaceStore.setState({ updateVirtualNodeFilter: vi.fn() });
  vi.useRealTimers();
});

it('moves virtual result selection with arrow keys', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const onSelectNode = vi.fn();

  render(
    <VirtualResultListPanel
      activeNodeId="first"
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'description', text: 'Virtual combines saved search results.' }}
      nodes={[first, second]}
      nodesById={{ first, second }}
      onSelectNode={onSelectNode}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /First result/ }), { key: 'ArrowDown' });

  expect(onSelectNode).toHaveBeenCalledWith('second');
});

it('debounces saved search query updates', () => {
  vi.useFakeTimers();
  const first = createNode('first', 'First result');

  render(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-a', query: '' }}
      nodes={[first]}
      nodesById={{ first }}
      onSelectNode={vi.fn()}
    />
  );

  fireEvent.change(screen.getByRole('searchbox', { name: 'Saved search query' }), { target: { value: 'alpha' } });

  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).not.toHaveBeenCalled();
  vi.advanceTimersByTime(299);
  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(useWorkspaceStore.getState().updateVirtualNodeFilter).toHaveBeenCalledWith('virtual-a', 'alpha');
});

it('does not render the transient title search launcher', () => {
  render(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-a', query: '' }}
      nodes={[]}
      nodesById={{}}
      onSelectNode={vi.fn()}
    />
  );

  expect(screen.queryByRole('button', { name: 'Open title search' })).toBeNull();
});
