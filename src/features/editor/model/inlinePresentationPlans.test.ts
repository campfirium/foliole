import { describe, expect, it } from 'vitest';

import {
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
    href: 'url'
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

  it('builds inline link label marks with interactive url attributes', () => {
    expect(collectInlineLinkPresentationPlan([createInlineLinkMatch()], true)).toEqual({
      markRanges: [
        {
          className: 'cm-md-link-text',
          from: 1,
          to: 5,
          attributes: { 'data-md-link-url': 'url' }
        },
        { className: 'cm-md-syntax-visible', from: 0, to: 1 },
        { className: 'cm-md-syntax-visible', from: 5, to: 7 },
        { className: 'cm-md-syntax-visible', from: 7, to: 10 },
        { className: 'cm-md-syntax-visible', from: 10, to: 11 }
      ],
      replaceRanges: []
    });
  });

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
});
