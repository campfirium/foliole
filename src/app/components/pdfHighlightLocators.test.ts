import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { collectPdfHighlightLocators } from './pdfHighlightLocators';

function createNode(overrides: Partial<Node> & Pick<Node, 'id' | 'parentNodeId'>): Node {
  const { id, parentNodeId, ...rest } = overrides;
  return {
    id,
    kind: 'topic',
    parentNodeId,
    title: id,
    content: '',
    anchorLink: null,
    reveal: null,
    review: null,
    createdAt: '',
    updatedAt: '',
    ...rest
  };
}

it('returns pdf highlight locators from the selected node subtree', () => {
    const nodesById: Record<string, Node> = {
      article: createNode({ id: 'article', parentNodeId: null }),
      highlightA: createNode({
        id: 'highlightA',
        parentNodeId: 'article',
        anchorLink: {
          id: 'pdf-hl-1',
          kind: 'highlight',
          locator: {
            page: 2,
            x: 0.25,
            y: 0.4
          }
        }
      })
    };

    const locators = collectPdfHighlightLocators('article', ['article', 'highlightA'], nodesById);

    expect(locators).toEqual([
      {
        id: 'pdf-hl-1',
        kind: 'highlight',
        label: 'highlightA',
        nodeId: 'highlightA',
        page: 2,
        x: 0.25,
        y: 0.4,
        rects: []
      }
    ]);
});

it('excludes trashed highlight nodes from pdf highlight locators', () => {
    const nodesById: Record<string, Node> = {
      article: createNode({ id: 'article', parentNodeId: null }),
      highlightA: createNode({
        id: 'highlightA',
        parentNodeId: 'article',
        anchorLink: {
          id: 'pdf-hl-1',
          kind: 'highlight',
          locator: {
            page: 2,
            x: 0.25,
            y: 0.4
          }
        }
      })
    };

    const locators = collectPdfHighlightLocators('article', ['article', 'highlightA'], nodesById, ['highlightA']);

    expect(locators).toEqual([]);
});

it('preserves image excerpt kind instead of inferring it from PDF coordinates', () => {
    const nodesById: Record<string, Node> = {
      article: createNode({ id: 'article', parentNodeId: null }),
      excerpt: createNode({
        id: 'excerpt', parentNodeId: 'article',
        anchorLink: { id: 'image-1', kind: 'image-excerpt', locator: {
          page: 1, x: 0.1, y: 0.2, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }]
        } }
      })
    };
    expect(collectPdfHighlightLocators('article', ['article', 'excerpt'], nodesById)).toEqual([
      expect.objectContaining({ id: 'image-1', kind: 'image-excerpt', nodeId: 'excerpt' })
    ]);
});
