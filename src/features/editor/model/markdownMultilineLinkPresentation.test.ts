import { describe, expect, it } from 'vitest';

import { folioleMarkdownParser } from './folioleMarkdownParser';
import { collectMarkdownInlineLinkRangesFromTree } from './markdownInlineLinkProjection';
import { collectMarkdownLinkReferencesFromTree } from './markdownLinkReferences';
import { collectMultilineLinkPresentationPlans } from './markdownMultilineLinkPresentation';

const MULTILINE_LINK = [
  '* [FAQ & Troubleshooting   ',
  ' 常见问题解答和故障排除](https://aquafina-water-bottle.github.io/jp-mining-note/faq/)'
].join('\n');

describe('markdown multiline link presentation', () => {
  it('hides multiline link syntax while marking the full label as one link', () => {
    expect(collectMultilineLinkPresentationPlans({ source: MULTILINE_LINK })).toEqual([
      {
        markRanges: [
          {
            attributes: { 'data-md-link-url': 'https://aquafina-water-bottle.github.io/jp-mining-note/faq/' },
            className: 'cm-md-link-text',
            from: 3,
            to: 40
          }
        ],
        replaceRanges: [
          { from: 2, to: 3 },
          { from: 40, to: 41 },
          { from: 41, to: 42 },
          { from: 42, to: 101 },
          { from: 101, to: 102 }
        ]
      }
    ]);
  });

  it('shows multiline link syntax when the cursor is inside the link', () => {
    const [plan] = collectMultilineLinkPresentationPlans({
      source: MULTILINE_LINK,
      syntaxVisiblePosition: 10
    });

    expect(plan?.replaceRanges).toEqual([]);
    expect(plan?.markRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ className: 'cm-md-link-text', from: 3, to: 40 }),
      expect.objectContaining({ className: 'cm-md-syntax-visible', from: 2, to: 3 }),
      expect.objectContaining({ className: 'cm-md-syntax-visible', from: 42, to: 101 })
    ]));
  });

  it('accepts link ranges collected from an already parsed markdown tree', () => {
    const tree = folioleMarkdownParser.parse(MULTILINE_LINK);
    const references = collectMarkdownLinkReferencesFromTree(tree, MULTILINE_LINK);
    const links = collectMarkdownInlineLinkRangesFromTree(tree, MULTILINE_LINK, 0, references);

    expect(collectMultilineLinkPresentationPlans({ links, source: MULTILINE_LINK })).toEqual(
      collectMultilineLinkPresentationPlans({ source: MULTILINE_LINK })
    );
  });
});
