import { describe, expect, it } from 'vitest';

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

describe('collectPdfHighlightLocators', () => {
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
});
