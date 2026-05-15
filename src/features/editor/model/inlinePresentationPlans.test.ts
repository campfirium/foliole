import { describe, expect, it } from 'vitest';

import {
  collectAutolinkPresentationPlan,
  collectEmbedPresentationPlan,
  collectInlineCodePresentationPlan,
  collectInlineLinkPresentationPlan,
  collectWikiLinkPresentationPlan
} from './inlinePresentationPlans';

function createInlineLinkMatch() {
  return {
    from: 0,
    to: 11,
    labelFrom: 1,
    labelTo: 5,
    hiddenRanges: [
      { from: 0, to: 1 },
      { from: 5, to: 7 },
      { from: 7, to: 10 },
      { from: 10, to: 11 }
    ],
    href: 'https://example.test/path'
  };
}

function createWikiLinkMatch() {
  return {
    from: 2,
    to: 10,
    labelFrom: 4,
    labelTo: 8,
    hiddenRanges: [
      { from: 2, to: 4 },
      { from: 8, to: 10 }
    ],
    title: 'Node'
  };
}

function createEmbedMatch() {
  return {
    from: 0,
    to: 16,
    labelFrom: 10,
    labelTo: 14,
    hiddenRanges: [
      { from: 0, to: 10 },
      { from: 14, to: 16 }
    ],
    target: 'Card'
  };
}

function createAliasedWikiLinkMatch() {
  return {
    from: 0,
    to: 31,
    labelFrom: 19,
    labelTo: 29,
    hiddenRanges: [
      { from: 0, to: 19 },
      { from: 29, to: 31 }
    ],
    title: 'Folder/Beta note'
  };
}

describe('inlinePresentationPlans', () => {
  it('builds inline code marks and hidden delimiters', () => {
    expect(
      collectInlineCodePresentationPlan([{ from: 3, to: 9, contentFrom: 4, contentTo: 8 }], false)
    ).toEqual({
      markRanges: [{ className: 'cm-md-inline-code', from: 4, to: 8 }],
      replaceRanges: [
        { from: 3, to: 4 },
        { from: 8, to: 9 }
      ]
    });
  });

  it('builds inline link label marks with safe url attributes', () => {
    expect(collectInlineLinkPresentationPlan([createInlineLinkMatch()], true)).toEqual({
      markRanges: [
        {
          className: 'cm-md-link-text',
          from: 1,
          to: 5,
          attributes: { 'data-md-link-url': 'https://example.test/path' }
        },
        { className: 'cm-md-syntax-visible', from: 0, to: 1 },
        { className: 'cm-md-syntax-visible', from: 5, to: 7 },
        { className: 'cm-md-syntax-visible', from: 7, to: 10 },
        { className: 'cm-md-syntax-visible', from: 10, to: 11 }
      ],
      replaceRanges: []
    });
  });
});

describe('wiki presentation plans', () => {
  it('builds wiki link label marks with node title attributes', () => {
    expect(collectWikiLinkPresentationPlan([createWikiLinkMatch()], false)).toEqual({
      markRanges: [
        {
          className: 'cm-md-link-text',
          from: 4,
          to: 8,
          attributes: { 'data-md-link-node-title': 'Node' }
        }
      ],
      replaceRanges: [
        { from: 2, to: 4 },
        { from: 8, to: 10 }
      ]
    });
  });

  it('builds aliased wiki links with only the alias visible', () => {
    expect(collectWikiLinkPresentationPlan([createAliasedWikiLinkMatch()], false)).toEqual({
      markRanges: [
        {
          className: 'cm-md-link-text',
          from: 19,
          to: 29,
          attributes: { 'data-md-link-node-title': 'Folder/Beta note' }
        }
      ],
      replaceRanges: [
        { from: 0, to: 19 },
        { from: 29, to: 31 }
      ]
    });
  });
});

describe('autolink presentation plans', () => {
  it('builds autolink marks with external url attributes', () => {
    expect(
      collectAutolinkPresentationPlan(
        [{ from: 4, hiddenRanges: [], href: 'https://example.com', labelFrom: 4, labelTo: 23, to: 23 }],
        false
      )
    ).toEqual({
      markRanges: [
        {
          attributes: { 'data-md-link-url': 'https://example.com' },
          className: 'cm-md-link-text',
          from: 4,
          to: 23
        }
      ],
      replaceRanges: []
    });
  });

  it('hides angle autolink delimiters outside source mode', () => {
    const match = {
      from: 4,
      hiddenRanges: [
        { from: 4, to: 5 },
        { from: 24, to: 25 }
      ],
      href: 'https://example.com',
      labelFrom: 5,
      labelTo: 24,
      to: 25
    };

    expect(collectAutolinkPresentationPlan([match], false)).toEqual({
      markRanges: [
        {
          attributes: { 'data-md-link-url': 'https://example.com' },
          className: 'cm-md-link-text',
          from: 5,
          to: 24
        }
      ],
      replaceRanges: [
        { from: 4, to: 5 },
        { from: 24, to: 25 }
      ]
    });
    expect(collectAutolinkPresentationPlan([match], true).replaceRanges).toEqual([]);
  });
});

describe('embed presentation plans', () => {
  it('builds embed label marks with target attributes', () => {
    expect(collectEmbedPresentationPlan([createEmbedMatch()], false)).toEqual({
      markRanges: [
        {
          className: 'cm-md-link-text',
          from: 10,
          to: 14,
          attributes: { 'data-md-embed-target': 'Card' }
        }
      ],
      replaceRanges: [
        { from: 0, to: 10 },
        { from: 14, to: 16 }
      ]
    });
  });
});
