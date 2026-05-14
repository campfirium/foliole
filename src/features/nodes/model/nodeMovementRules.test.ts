import { expect, it } from 'vitest';

import { definedProps } from '../../../shared/lib/definedProps';

import { canNodeAcceptMovedNode, canNodeBeMoved } from './nodeMovementRules';
import type { Node } from './nodeTypes';

function createNode(partial: Partial<Node> & Pick<Node, 'id' | 'title' | 'content' | 'kind'>): Node {
  return {
    id: partial.id,
    parentNodeId: partial.parentNodeId ?? null,
    kind: partial.kind,
    title: partial.title,
    content: partial.content,
    reveal: partial.reveal ?? null,
    review: partial.review ?? null,
    anchorLink: partial.anchorLink ?? null,
    createdAt: partial.createdAt ?? '2026-03-31T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-03-31T00:00:00.000Z',
    ...definedProps({ specialKind: partial.specialKind })
  };
}

it('blocks moving derived topics and items', () => {
  expect(
    canNodeBeMoved(createNode({
      id: 'topic-derived',
      title: 'Derived topic',
      content: 'Child',
      kind: 'topic',
      anchorLink: { id: 'hl-1', kind: 'highlight' }
    }))
  ).toBe(false);
  expect(canNodeBeMoved(createNode({ id: 'topic-1', title: 'Topic', content: 'Body', kind: 'topic' }))).toBe(true);
  expect(canNodeBeMoved(createNode({ id: 'item-1', title: 'Card', content: 'Prompt', kind: 'item' }))).toBe(false);
});

it('allows folders to accept topics but not items to accept children', () => {
  const folder = createNode({ id: 'folder-1', title: 'Folder', content: '', kind: 'folder' });
  const topic = createNode({ id: 'topic-1', title: 'Topic', content: 'Body', kind: 'topic' });
  const item = createNode({ id: 'item-1', title: 'Card', content: 'Prompt', kind: 'item' });

  expect(canNodeAcceptMovedNode(folder, topic)).toBe(true);
  expect(canNodeAcceptMovedNode(item, topic)).toBe(false);
});
