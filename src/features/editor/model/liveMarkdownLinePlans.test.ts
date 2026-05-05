import { describe, expect, it } from 'vitest';

import { collectPreviewLineDecorationPlan, collectSourceLineDecorationPlan } from './liveMarkdownLinePlans';

describe('liveMarkdown preview line plans', () => {
  it('builds preview plans for title and fenced lines', () => {
    expect(
      collectPreviewLineDecorationPlan({
        hideTitleHeading: true,
        inCodeBlock: false,
        isCursorLine: false,
        lineFrom: 0,
        lineClassByFrom: new Map([[0, 'cm-line-h1']]),
        lineNumber: 1,
        lineText: '# Title',
        markdownSyntaxVisible: false
      })
    ).toMatchObject({
      imageVisible: true,
      isCodeFenceLine: false,
      lineClass: 'cm-line-title-heading-hidden',
      nextInCodeBlock: false,
      prefixVisible: true
    });

    expect(
      collectPreviewLineDecorationPlan({
        codeFenceLineFroms: new Set([0]),
        hideTitleHeading: false,
        inCodeBlock: false,
        isCursorLine: false,
        lineFrom: 0,
        lineClassByFrom: new Map([[0, 'cm-line-h1']]),
        lineNumber: 2,
        lineText: '```ts',
        markdownSyntaxVisible: false
      })
    ).toMatchObject({
      isCodeFenceLine: true,
      lineClass: 'cm-line-code-fence-hidden',
      nextInCodeBlock: true,
      prefixVisible: true
    });
  });

  it('adds autolink presentation to preview plans', () => {
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: false,
      inCodeBlock: false,
      isCursorLine: false,
      lineFrom: 0,
      lineNumber: 1,
      lineText: 'See https://example.com',
      markdownSyntaxVisible: false
    });

    expect(plan.inlinePresentationPlans.at(-1)?.markRanges).toEqual([
      {
        attributes: { 'data-md-link-url': 'https://example.com' },
        className: 'cm-md-link-text',
        from: 4,
        to: 23
      }
    ]);
  });
});

describe('liveMarkdown reference-style preview line plans', () => {
  it('adds reference-style link presentation to preview plans', () => {
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: false,
      inCodeBlock: false,
      isCursorLine: false,
      lineFrom: 0,
      lineNumber: 1,
      lineText: 'See [docs][ref]',
      linkReferences: new Map([['ref', 'https://example.com']]),
      markdownSyntaxVisible: false
    });

    expect(plan.inlinePresentationPlans[1]).toEqual({
      markRanges: [
        {
          attributes: { 'data-md-link-url': 'https://example.com' },
          className: 'cm-md-link-text',
          from: 5,
          to: 9
        }
      ],
      replaceRanges: [
        { from: 4, to: 5 },
        { from: 9, to: 10 },
        { from: 10, to: 15 }
      ]
    });
  });

  it('hides reference definition lines in preview plans', () => {
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: false,
      inCodeBlock: false,
      isCursorLine: false,
      lineFrom: 0,
      lineNumber: 1,
      lineText: '[ref]: https://example.com',
      linkReferenceLineFroms: new Set([0]),
      markdownSyntaxVisible: false
    });

    expect(plan.lineClass).toBe('cm-line-link-reference-hidden');
  });
});

describe('liveMarkdown Obsidian-like preview line plans', () => {
  it('renders embeds and non-embed wiki links as separate parser-backed plans', () => {
    const plan = collectPreviewLineDecorationPlan({
      hideTitleHeading: false,
      inCodeBlock: false,
      isCursorLine: false,
      lineFrom: 0,
      lineNumber: 1,
      lineText: '![[image.png]] [[image.png]]',
      markdownSyntaxVisible: false
    });

    expect(plan.inlinePresentationPlans[2]).toEqual({
      markRanges: [
        {
          attributes: { 'data-md-link-node-title': 'image.png' },
          className: 'cm-md-link-text',
          from: 17,
          to: 26
        }
      ],
      replaceRanges: [
        { from: 15, to: 17 },
        { from: 26, to: 28 }
      ]
    });
    expect(plan.inlinePresentationPlans[3]).toEqual({
      markRanges: [
        {
          attributes: { 'data-md-embed-target': 'image.png' },
          className: 'cm-md-link-text',
          from: 3,
          to: 12
        }
      ],
      replaceRanges: [
        { from: 0, to: 3 },
        { from: 12, to: 14 }
      ]
    });
  });
});

describe('liveMarkdown source line plans', () => {
  it('builds source plans with syntax-visible inline preservation', () => {
    const plan = collectSourceLineDecorationPlan({
      inCodeBlock: false,
      lineFrom: 0,
      lineText: '`x` [a](b) [[Node]] [...]'
    });

    expect(plan.footnoteMatches).toEqual([]);
    expect(plan.inlinePresentationPlans).toHaveLength(4);
    expect(plan.textDecorationPlans).toHaveLength(2);
    expect(plan.nextInCodeBlock).toBe(false);
  });
});
