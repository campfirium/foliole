import { describe, expect, it } from 'vitest';

import type { Node } from '../../nodes/model/nodeTypes';

import {
  collectDocumentTextAnchorDecorations,
  collectDocumentTextAnchorPresentation,
  collectLegacyInlineAnchorKeys
} from './documentTextAnchorDecorations';

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
      to: content.indexOf('Beta') + 'Beta'.length
    }
  ]);
}

function createLegacyHiddenKeyArgs(parentContent: string) {
  return {
    activeNodeId: 'node-1',
    parentContent,
    nodesById: {
      'child-1': {
        id: 'child-1',
        parentNodeId: 'node-1',
        kind: 'topic' as const,
        title: 'Child',
        content: 'Beta',
        anchorLink: { id: 'anchor-1', kind: 'highlight' as const },
        reveal: null,
        review: null,
        createdAt: '2026-04-14T00:00:00.000Z',
        updatedAt: '2026-04-14T00:00:00.000Z'
      }
    },
    trashedNodeIds: ['child-1']
  };
}

function createPresentationNodes(content: string) {
  return {
    'node-1': createParentNode(content),
    'node-2': createHighlightChildNode({
      locator: {
        from: content.indexOf('Beta'),
        originalText: 'Beta',
        to: content.indexOf('Beta') + 'Beta'.length
      },
      parentNodeId: 'node-1'
    }),
    'child-1': {
      ...createLegacyHiddenKeyArgs(content).nodesById['child-1'],
      title: 'Legacy child'
    }
  };
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

  it('ignores stale text locators that no longer match the document text', () => {
    expect(
      collectDocumentTextAnchorDecorations({
        activeNodeId: 'node-1',
        nodesById: {
          'node-2': createHighlightChildNode({
            locator: {
              from: 0,
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

  it('recovers a stale text locator when the original text moved to one unique place', () => {
    const content = 'Start Alpha Beta Gamma';
    expectHighlightDecorationForContent(content, {
      from: 6,
      originalText: 'Beta',
      to: 10
    });
  });

  it('skips legacy hidden keys when the parent content is already pure markdown', () => {
    expect(collectLegacyInlineAnchorKeys(createLegacyHiddenKeyArgs('Alpha Beta Gamma'))).toEqual([]);
  });
}

function registerDocumentTextAnchorPresentationTests() {
  it('collects both text decorations and legacy hidden keys from one presentation model', () => {
    const content = 'Alpha <highlight id="anchor-1">Beta</highlight id="anchor-1"> Gamma';
    expect(
      collectDocumentTextAnchorPresentation({
        activeNodeId: 'node-1',
        nodesById: createPresentationNodes(content),
        parentContent: content,
        trashedNodeIds: ['child-1']
      })
    ).toEqual({
      inlineAnchorCompatibility: {
        hiddenKeys: ['highlight:anchor-1']
      },
      textAnchorDecorations: [
        {
          from: content.indexOf('Beta'),
          kind: 'highlight',
          to: content.indexOf('Beta') + 'Beta'.length
        }
      ]
    });
  });
}

describe('documentTextAnchorDecorations', () => {
  registerDocumentTextAnchorDecorationTests();
  registerDocumentTextAnchorPresentationTests();
});
