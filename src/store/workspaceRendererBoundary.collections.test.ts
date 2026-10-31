import { expect, it } from 'vitest';

import { createCollectionVirtualNodeFilter } from '../../lib/core/nodes/virtualNodeFilter';
import { resolveVirtualNodeResultIds } from '../../lib/core/nodes/virtualNodeResults';
import type { Node } from '../features/nodes/model/nodeTypes';

import { toRendererBoundaryNode } from './workspaceRendererBoundary';

function article(content: string, collections: string[]): Node {
  return {
    id: 'article', kind: 'topic', title: 'Article', parentNodeId: null,
    content, collections, reveal: null, reading: null, review: null,
    hasContent: content.trim().length > 0, hasReveal: false,
    bodyStatus: content.trim().length > 0 ? 'ready' : 'empty',
    createdAt: '2026-10-31T00:00:00.000Z', updatedAt: '2026-10-31T00:01:00.000Z'
  };
}

function matchingIds(node: Node) {
  return resolveVirtualNodeResultIds({ activeNodeId: 'saved',
    filter: createCollectionVirtualNodeFilter('Guide'),
    nodeOrder: ['article'], nodesById: { article: node } });
}

it.each([
  ['removed header', 'Complete plain body.', ['Guide'], []],
  ['added header', '---\ncollections:\n  - "Guide"\n---\nComplete body.', [], ['article']],
  ['empty body', '', ['Guide'], []],
  ['BOM and CRLF header', '\ufeff---\r\ncollections:\r\n  - "Guide"\r\n---\r\n中😀\r\n', [], ['article']],
  ['invalid collections', '---\ncollections: wrong-shape\n---\nComplete body.', ['Guide'], []]
] as [string, string, string[], string[]][])(
  'keeps collection membership current after switching away from %s', (_name, body, oldCollections, expected) => {
    const active = toRendererBoundaryNode(article(body, oldCollections), true);
    expect(active.content).toBe(body);
    const inactive = toRendererBoundaryNode(active, false);
    expect(inactive.content).toBe('');
    expect(matchingIds(inactive)).toEqual(expected);
  }
);

it('retains host collection metadata when the document has not been loaded', () => {
  const unloaded: Node = { ...article('', ['Guide']), bodyStatus: 'fetching', hasContent: true };
  expect(matchingIds(toRendererBoundaryNode(unloaded, false))).toEqual(['article']);
});
