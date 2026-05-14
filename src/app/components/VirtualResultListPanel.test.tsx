import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

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
});

it('moves virtual result selection with arrow keys', () => {
  const first = createNode('first', 'First result');
  const second = createNode('second', 'Second result');
  const onSelectNode = vi.fn();

  render(
    <VirtualResultListPanel
      activeNodeId="first"
      emptyState={{ description: 'No results', title: 'Empty' }}
      nodes={[first, second]}
      nodesById={{ first, second }}
      onSelectNode={onSelectNode}
    />
  );

  fireEvent.keyDown(screen.getByRole('treeitem', { name: /First result/ }), { key: 'ArrowDown' });

  expect(onSelectNode).toHaveBeenCalledWith('second');
});
