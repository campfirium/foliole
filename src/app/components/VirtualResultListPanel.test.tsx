import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { VirtualResultListPanel } from './VirtualResultListPanel';

function createNode(id: string, title: string, content = ''): Node {
  return {
    content,
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

function SelectionHarness(props: { onSelectNode?: (nodeId: string) => void }) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const third = createNode('third', 'Third result');
  const nodes = [first, second, third];
  const handleSelectNode = (nodeId: string) => {
    setActiveNodeId(nodeId);
    props.onSelectNode?.(nodeId);
  };

  return (
    <VirtualResultListPanel
      activeNodeId={activeNodeId}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'description', text: 'Mixed results.', title: 'Mixed' }}
      nodeOrder={nodes.map((node) => node.id)}
      nodes={nodes}
      nodesById={{ first, second, third }}
      onSelectNode={handleSelectNode}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

it('renders virtual root with the shared topic list surface', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const onSelectNode = vi.fn();

  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId="first"
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'root' }}
      nodeOrder={['first', 'second']}
      nodes={[first, second]}
      nodesById={{ first, second }}
      onSelectNode={onSelectNode}
    />
  );

  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Current folder topics' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open title search' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save search' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create topic' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'First result' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'second' }
  });
  fireEvent.click(screen.getByRole('treeitem', { name: 'Second result' }));

  expect(onSelectNode).toHaveBeenCalledWith('second');
});

it('keeps the original anchor when shift-selecting virtual result ranges', () => {
  const onSelectNode = vi.fn();
  renderWithLocalization(<SelectionHarness onSelectNode={onSelectNode} />);

  fireEvent.click(screen.getByRole('treeitem', { name: 'First result' }));
  fireEvent.click(screen.getByRole('treeitem', { name: 'Third result' }), { shiftKey: true });

  expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(3);
  expect(screen.getByRole('treeitem', { name: 'First result' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Second result' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Third result' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(onSelectNode).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('treeitem', { name: 'Second result' }), { shiftKey: true });

  expect(screen.getAllByRole('treeitem', { selected: true })).toHaveLength(2);
  expect(screen.getByRole('treeitem', { name: 'First result' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Second result' })).toHaveAttribute('data-node-bulk-selected', 'true');
  expect(screen.getByRole('treeitem', { name: 'Third result' })).not.toHaveAttribute('data-node-bulk-selected');
  expect(onSelectNode).toHaveBeenCalledTimes(1);
});

it('filters saved virtual list results from the shared topic list header', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');

  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'user-search', nodeId: 'virtual-a', query: 'first', title: 'Saved Search' }}
      nodeOrder={['first', 'second']}
      nodes={[first, second]}
      nodesById={{ first, second }}
      onSelectNode={vi.fn()}
    />
  );

  expect(screen.getByRole('complementary', { name: 'Current folder contents' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Current folder topics' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open title search' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topic titles' }), {
    target: { value: 'second' }
  });

  expect(screen.queryByRole('treeitem', { name: 'First result' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'Second result' })).toBeInTheDocument();
});

it('preserves manual virtual collection order from the API', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const third = createNode('third', 'Third result');

  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'description', text: 'Manual collection.', title: 'Manual' }}
      nodeOrder={['third', 'first', 'second']}
      nodes={[third, first, second]}
      nodesById={{ first, second, third }}
      onSelectNode={vi.fn()}
      preserveItemOrder
    />
  );

  expect(screen.getByRole('button', { name: 'Sort list by Manual' })).toBeInTheDocument();
  expect(screen.getAllByRole('treeitem').map((item) => item.textContent)).toEqual([
    'Third result',
    'First result',
    'Second result'
  ]);

  fireEvent.keyDown(screen.getByRole('button', { name: 'Sort list by Manual' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Name' }));

  expect(screen.getAllByRole('treeitem').map((item) => item.textContent)).toEqual([
    'First result',
    'Second result',
    'Third result'
  ]);
});

it('renders built-in virtual lists with the shared topic header', () => {
  const first = createNode('first', 'First result');

  renderWithLocalization(
    <VirtualResultListPanel
      activeNodeId={null}
      emptyState={{ description: 'No results', title: 'Empty' }}
      header={{ kind: 'description', text: 'List deleted topics with linked sources.', title: 'Removed' }}
      nodeOrder={['first']}
      nodes={[first]}
      nodesById={{ first }}
      onSelectNode={vi.fn()}
    />
  );

  expect(screen.queryByText('List deleted topics with linked sources.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open title search' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sort list by Date modified' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide dismissed and shelved topics' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create topic' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'First result' })).toBeInTheDocument();
});
