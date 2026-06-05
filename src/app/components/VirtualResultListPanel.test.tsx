import { fireEvent, screen } from '@testing-library/react';
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
  expect(screen.getByRole('button', { name: 'Focus active topics' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create topic' })).toBeNull();
  expect(screen.getByRole('treeitem', { name: 'First result' })).toBeInTheDocument();
});
