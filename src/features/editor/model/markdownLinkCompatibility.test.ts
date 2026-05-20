import { describe, expect, it } from 'vitest';

import { collectInlineLinkPresentationPlan } from './inlinePresentationPlans';
import { collectMarkdownForumTitleLinkRanges } from './markdownForumTitleLinkProjection';
import { collectMarkdownInlineLinkRanges } from './markdownInlineLinkProjection';
import { projectMarkdownInlineText } from './markdownInlineTextProjection';
import { tokenizeMarkdownTableInlineText } from './markdownTableInline';

describe('markdown link compatibility matrix plain links', () => {
  it('keeps escaped plain links readable and projectable', () => {
    const text = '[\\*label](https://example.test/path_(one))';
    const [linkRange] = collectMarkdownInlineLinkRanges(text);
    expect(linkRange).toMatchObject({ href: 'https://example.test/path_(one)', labelText: '*label', safe: true });
    expect(linkRange?.hiddenRanges).toEqual(expect.arrayContaining([{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 8, to: 9 }, { from: 9, to: 10 }]));
    expect(collectInlineLinkPresentationPlan([linkRange!], false)).toMatchObject({
      markRanges: [{ attributes: { 'data-md-link-url': 'https://example.test/path_(one)', title: 'Ctrl-click to open in browser' }, className: 'cm-md-link-text', from: 1, to: 8 }]
    });
    expect(collectInlineLinkPresentationPlan([linkRange!], true).markRanges).toEqual(expect.arrayContaining([expect.objectContaining({ className: 'cm-md-link-text', from: 1, to: 8 }), expect.objectContaining({ className: 'cm-md-syntax-visible', from: 0, to: 1 })]));
    expect(projectMarkdownInlineText(text)).toEqual([{ href: 'https://example.test/path_(one)', kind: 'link', text: '*label' }]);
    expect(tokenizeMarkdownTableInlineText(text)).toEqual([{ href: 'https://example.test/path_(one)', kind: 'link', text: '*label' }]);
  });

  it('projects indented list item links when live Markdown scans a nested line in isolation', () => {
    const text = '    - [Home 家](https://aquafina-water-bottle.github.io/jp-mining-note/)';
    const [linkRange] = collectMarkdownInlineLinkRanges(text);
    expect(linkRange).toMatchObject({
      href: 'https://aquafina-water-bottle.github.io/jp-mining-note/',
      labelFrom: 7,
      labelText: 'Home 家',
      labelTo: 13,
      safe: true
    });
    expect(collectInlineLinkPresentationPlan([linkRange!], false)).toMatchObject({
      markRanges: [
        {
          attributes: { 'data-md-link-url': 'https://aquafina-water-bottle.github.io/jp-mining-note/', title: 'Ctrl-click to open in browser' },
          className: 'cm-md-link-text',
          from: 7,
          to: 13
        }
      ],
      replaceRanges: expect.arrayContaining([{ from: 6, to: 7 }, { from: 13, to: 14 }])
    });
  });
});

describe('markdown link compatibility matrix unsafe links', () => {
  it('keeps unsafe hrefs readable but non-clickable', () => {
    const text = '[unsafe](javascript:alert(1))';
    const [linkRange] = collectMarkdownInlineLinkRanges(text);
    expect(linkRange).toMatchObject({ href: 'javascript:alert(1)', labelText: 'unsafe', safe: false });
    expect(collectInlineLinkPresentationPlan([linkRange!], false)).toMatchObject({
      markRanges: [{ className: 'cm-md-link-text cm-md-link-text-unsafe', from: 1, to: 7 }],
      replaceRanges: expect.arrayContaining([{ from: 0, to: 1 }, { from: 7, to: 8 }])
    });
    expect(projectMarkdownInlineText(text)).toEqual([{ kind: 'unsafeLink', text: 'unsafe' }]);
  });
});

describe('markdown link compatibility matrix quoted destinations', () => {
  it('normalizes quoted destinations as link hrefs', () => {
    const text = '[quoted]("https://example.test/path_(one)")';
    const [linkRange] = collectMarkdownInlineLinkRanges(text);
    expect(linkRange).toMatchObject({ href: 'https://example.test/path_(one)', labelText: 'quoted', safe: true });
    expect(projectMarkdownInlineText(text)).toEqual([{ href: 'https://example.test/path_(one)', kind: 'link', text: 'quoted' }]);
  });
});

describe('markdown link compatibility matrix forum links', () => {
  it('projects forum title links from adjacent title and url lines', () => {
    const text = ['[Forum title]', '(https://example.test/forum)'].join('\n');
    const [forumLink] = collectMarkdownForumTitleLinkRanges(text);
    expect(forumLink).toMatchObject({ href: 'https://example.test/forum', labelText: 'Forum title', safe: true, title: 'Forum title' });
    expect(forumLink?.hiddenRanges).toEqual(expect.arrayContaining([{ from: 0, to: 1 }, { from: 12, to: 13 }, { from: 14, to: 42 }]));
    expect(projectMarkdownInlineText(text)).toEqual([{ href: 'https://example.test/forum', kind: 'link', text: 'Forum title' }]);
  });
});
