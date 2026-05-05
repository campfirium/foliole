import { expect, it } from 'vitest';

import { collectBacklinks, collectWikiLinkMatches, resolveInternalLinkTargetId } from './internalLinks';
import type { Node } from './nodeTypes';

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Node',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: overrides.createdAt ?? '2026-04-12T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-12T00:00:00.000Z'
  };
}

it('collects visible wiki links and skips embeds', () => {
  expect(collectWikiLinkMatches('Read [[Alpha]] then ![[embedded-note]] and [[Beta]]')).toEqual([
    { from: 5, title: 'Alpha', to: 14 },
    { from: 43, title: 'Beta', to: 51 }
  ]);
});

it('resolves the first visible node whose title matches the wiki link', () => {
  const nodesById = {
    alpha: createNode({ id: 'alpha', title: 'Alpha' }),
    beta: createNode({ id: 'beta', title: 'Beta' })
  };

  expect(
    resolveInternalLinkTargetId({
      title: 'beta',
      nodeOrder: ['alpha', 'beta'],
      nodesById,
      trashedNodeIds: []
    })
  ).toBe('beta');
});

it('collects backlinks from visible nodes in workspace order', () => {
  const nodesById = {
    target: createNode({ id: 'target', title: 'Alpha' }),
    first: createNode({ id: 'first', title: 'First note', content: 'Start\nSee [[Alpha]] for details.\nEnd' }),
    second: createNode({ id: 'second', title: 'Second note', content: '[[Alpha]] appears twice.\nAnd [[Alpha]] again.' }),
    trashed: createNode({ id: 'trashed', title: 'Trashed note', content: '[[Alpha]] hidden.' })
  };

  expect(
    collectBacklinks({
      targetNodeId: 'target',
      nodeOrder: ['target', 'second', 'trashed', 'first'],
      nodesById,
      trashedNodeIds: ['trashed']
    })
  ).toEqual([
    {
      context: '[[Alpha]] appears twice.',
      matchCount: 2,
      sourceNodeId: 'second',
      sourceTitle: 'Second note'
    },
    {
      context: 'See [[Alpha]] for details.',
      matchCount: 1,
      sourceNodeId: 'first',
      sourceTitle: 'First note'
    }
  ]);
});
