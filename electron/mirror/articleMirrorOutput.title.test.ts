// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { renderSingleArticleMirror, type MirrorRenderableNode } from './articleMirrorOutput.js';

function createArticle(args: {
  content: string;
  hideTitleHeading?: boolean;
  title: string;
}): MirrorRenderableNode {
  return {
    anchorLink: null,
    content: args.content,
    hideTitleHeading: args.hideTitleHeading ?? false,
    id: 'node-article',
    kind: 'topic',
    parentNodeId: null,
    reveal: null,
    title: args.title,
    updatedAt: '2026-07-04T00:00:00.000Z'
  };
}

describe('article mirror title rendering', () => {
  it('keeps an existing body H1 instead of adding the node title', () => {
    const markdown = renderSingleArticleMirror(
      createArticle({
        content: '# Article H1\n\nBody',
        hideTitleHeading: true,
        title: 'Node Title'
      }),
      [],
      []
    );

    expect(markdown).toBe('# Article H1\n\nBody\n');
  });

  it('uses the node title when the body has no H1', () => {
    const markdown = renderSingleArticleMirror(
      createArticle({
        content: 'Body',
        title: 'Node Title'
      }),
      [],
      []
    );

    expect(markdown).toBe('# Node Title\n\nBody\n');
  });

  it('does not duplicate the node title when the body H1 differs from the node title', () => {
    const markdown = renderSingleArticleMirror(
      createArticle({
        content: '# Body Title\n\nBody',
        title: 'Node Title'
      }),
      [],
      []
    );

    expect(markdown).toBe('# Body Title\n\nBody\n');
  });
});
