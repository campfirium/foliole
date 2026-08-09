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

it('blocks moving derived nodes while allowing regular topics and items', () => {
  expect(
    canNodeBeMoved(createNode({
      id: 'topic-derived',
      title: 'Derived topic',
      content: 'Child',
      kind: 'topic',
      anchorLink: { id: 'hl-1', kind: 'highlight' }
    }))
  ).toBe(false);
  expect(
    canNodeBeMoved(createNode({
      id: 'item-derived',
      title: 'Derived item',
      content: 'Prompt',
      kind: 'item',
      anchorLink: { id: 'cloze-1', kind: 'cloze' }
    }))
  ).toBe(false);
  expect(canNodeBeMoved(createNode({ id: 'topic-1', title: 'Topic', content: 'Body', kind: 'topic' }))).toBe(true);
  expect(canNodeBeMoved(createNode({ id: 'item-1', title: 'Card', content: 'Prompt', kind: 'item' }))).toBe(true);
});

it('allows folders to accept topics but not items to accept children', () => {
  const folder = createNode({ id: 'folder-1', title: 'Folder', content: '', kind: 'folder' });
  const topic = createNode({ id: 'topic-1', title: 'Topic', content: 'Body', kind: 'topic' });
  const item = createNode({ id: 'item-1', title: 'Card', content: 'Prompt', kind: 'item' });

  expect(canNodeAcceptMovedNode(folder, topic)).toBe(true);
  expect(canNodeAcceptMovedNode(item, topic)).toBe(false);
});

it('allows virtual folders to nest only under Virtual or another virtual folder', () => {
  const virtualRoot = createNode({ id: 'special-virtual-root', title: 'Virtual', content: '', kind: 'folder', specialKind: 'virtual-root' });
  const parent = createNode({ id: 'virtual-parent', title: 'Parent', content: '', kind: 'folder', specialKind: 'virtual' });
  const child = createNode({ id: 'virtual-child', title: 'Child', content: '', kind: 'folder', specialKind: 'virtual' });
  const regular = createNode({ id: 'folder', title: 'Folder', content: '', kind: 'folder' });

  expect(canNodeAcceptMovedNode(virtualRoot, child)).toBe(true);
  expect(canNodeAcceptMovedNode(parent, child)).toBe(true);
  expect(canNodeAcceptMovedNode(regular, child)).toBe(false);
});

it('blocks moving Home and dropping nodes into Home', () => {
  const home = createNode({ id: 'special-home', title: 'Home', content: '', kind: 'folder', specialKind: 'home' });
  const topic = createNode({ id: 'topic-1', title: 'Topic', content: 'Body', kind: 'topic' });

  expect(canNodeBeMoved(home)).toBe(false);
  expect(canNodeAcceptMovedNode(home, topic)).toBe(false);
});
