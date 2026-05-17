import { describe, expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import { collectDocumentTextAnchorDecorations } from './documentTextAnchorDecorations';

function createHighlightChildNode(overrides: {
  locator: { from: number; originalText: string; to: number };
  parentNodeId: string;
}): Node {
  return {
    id: 'node-2',
    parentNodeId: overrides.parentNodeId,
    kind: 'topic' as const,
    title: 'Highlight child',
    content: 'Beta',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight' as const,
      locator: overrides.locator
    },
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function createParentNode(content: string): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Parent',
    content,
    anchorLink: null,
    reveal: null,
    review: null,
    createdAt: '2026-04-14T00:00:00.000Z',
    updatedAt: '2026-04-14T00:00:00.000Z'
  };
}

function expectHighlightDecorationForContent(content: string, locator: { from: number; originalText: string; to: number }) {
  expect(
    collectDocumentTextAnchorDecorations({
      activeNodeId: 'node-1',
      nodesById: {
        'node-1': createParentNode(content),
        'node-2': createHighlightChildNode({
          locator,
          parentNodeId: 'node-1'
        })
      },
      parentContent: content,
      trashedNodeIds: []
    })
  ).toEqual([
    {
      from: content.indexOf('Beta'),
      kind: 'highlight',
      nodeId: 'node-2',
      to: content.indexOf('Beta') + 'Beta'.length
    }
  ]);
}

function registerDocumentTextAnchorDecorationTests() {
  it('collects direct child text anchors for the active document', () => {
    const content = 'Alpha Beta Gamma';
    expectHighlightDecorationForContent(content, {
      from: content.indexOf('Beta'),
      originalText: 'Beta',
      to: content.indexOf('Beta') + 'Beta'.length
    });
  });

  it('renders by stored locator positions without re-matching text', () => {
    expect(
      collectDocumentTextAnchorDecorations({
        activeNodeId: 'node-1',
        nodesById: {
          'node-1': createParentNode('Start Alpha Beta Gamma'),
          'node-2': createHighlightChildNode({
            locator: {
              from: 6,
              originalText: 'Beta',
              to: 10
            },
            parentNodeId: 'node-1'
          })
        },
        parentContent: 'Start Alpha Beta Gamma',
        trashedNodeIds: []
      })
    ).toEqual([
      {
        from: 6,
        kind: 'highlight',
        nodeId: 'node-2',
        to: 10
      }
    ]);
  });

  it('hides zero-width locators from visible highlight decorations', () => {
    expect(
      collectDocumentTextAnchorDecorations({
        activeNodeId: 'node-1',
        nodesById: {
          'node-1': createParentNode('Gamma Delta'),
          'node-2': createHighlightChildNode({
            locator: {
              from: 4,
              originalText: 'Beta',
              to: 4
            },
            parentNodeId: 'node-1'
          })
        },
        parentContent: 'Gamma Delta',
        trashedNodeIds: []
      })
    ).toEqual([]);
  });
}

describe('documentTextAnchorDecorations', () => {
  registerDocumentTextAnchorDecorationTests();
});
