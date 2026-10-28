import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarHighlightsPanel } from './WorkspaceRightSidebarHighlightsPanel';

function topic(id: string, parentNodeId: string | null = null): Node {
  return {
    id, parentNodeId, kind: 'topic', title: id, content: '',
    createdAt: '2026-10-28', updatedAt: '2026-10-28', priority: null,
    desiredRetention: null, reveal: null, review: null
  };
}

function highlight(id: string, parentNodeId: string): Node {
  return {
    ...topic(id, parentNodeId),
    anchorLink: {
      id, kind: 'highlight',
      locator: { page: 1, x: 0.2, y: 0.2 }
    }
  };
}

function panel(nodesById: Record<string, Node>, nodeOrder: string[], trashedNodeIds: string[] = []) {
  return <WorkspaceRightSidebarHighlightsPanel activeNodeId="root" nodesById={nodesById}
    nodeOrder={nodeOrder} trashedNodeIds={trashedNodeIds} onRevealHighlight={() => undefined} />;
}

it.each([100, 1000])('does not read unrelated list fields with %i other topics', (count) => {
  const nodesById: Record<string, Node> = { root: topic('root'), mark: highlight('mark', 'root') };
  let unrelatedFieldReads = 0;
  for (let index = 0; index < count; index += 1) {
    const id = `other-${index}`;
    nodesById[id] = new Proxy(topic(id), {
      get(target, key, receiver) {
        if (['content', 'title', 'createdAt', 'updatedAt', 'review', 'reading'].includes(String(key))) {
          unrelatedFieldReads += 1;
        }
        return Reflect.get(target, key, receiver);
      }
    });
  }
  const nodeOrder = Object.keys(nodesById);
  const { rerender } = renderWithLocalization(panel(nodesById, nodeOrder));
  expect(screen.getByRole('button', { name: 'mark' })).toBeInTheDocument();
  rerender(panel({ ...nodesById, root: { ...nodesById.root!, priority: 3 } }, nodeOrder));
  expect(screen.getByRole('button', { name: 'mark' })).toBeInTheDocument();
  expect(unrelatedFieldReads).toBe(0);
});

it('removes trashed parents before discovering the subtree and refreshes on restore and move', () => {
  const nodesById = {
    root: topic('root'), nested: topic('nested', 'root'),
    first: highlight('first', 'nested'), second: highlight('second', 'root'),
    outside: topic('outside'), other: highlight('other', 'outside')
  };
  const order = ['root', 'nested', 'first', 'second', 'outside', 'other'];
  const { rerender } = renderWithLocalization(panel(nodesById, order, ['nested']));
  expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'second' })).toBeInTheDocument();
  rerender(panel(nodesById, order));
  expect(within(screen.getByRole('list')).getAllByRole('button').map((row) => row.textContent))
    .toEqual(['first', 'second']);
  rerender(panel({ ...nodesById, nested: topic('nested', 'outside') }, order));
  expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'second' })).toBeInTheDocument();
});
