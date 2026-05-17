import { expect, it } from 'vitest';

import type { Node } from './nodeTypes';
import { projectWorkspaceListNodesById, toWorkspaceListNode } from './workspaceListNode';

function createImageHighlightNode(content: string): Node {
  return {
    anchorLink: {
      id: 'hl-image',
      kind: 'highlight',
      locator: { from: 0, originalText: content, to: content.length }
    },
    content,
    createdAt: '2026-05-17T00:00:00.000Z',
    id: 'node-image-highlight',
    kind: 'topic',
    parentNodeId: 'node-parent',
    reveal: null,
    review: null,
    title: 'Untitled',
    updatedAt: '2026-05-17T00:00:00.000Z'
  };
}

it('projects legacy untitled image highlight nodes to a stable list title', () => {
  const node = createImageHighlightNode('![](asset://hash.jpg)');

  expect(toWorkspaceListNode(node).title).toBe('Image highlight');
});

it('refreshes the list projection when an untitled highlight becomes image-only content', () => {
  const initial = createImageHighlightNode('plain text');
  const initialProjection = projectWorkspaceListNodesById({ [initial.id]: initial });
  const next = { ...initial, content: '![](asset://hash.jpg)' };
  const nextProjection = projectWorkspaceListNodesById({ [next.id]: next }, initialProjection);

  expect(nextProjection[next.id]?.title).toBe('Image highlight');
  expect(nextProjection).not.toBe(initialProjection);
});
