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
        hideTitleHeading: false,
        inCodeBlock: false,
        isCursorLine: false,
        lineFrom: 0,
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

describe('liveMarkdown source line plans', () => {
  it('builds source plans with syntax-visible inline preservation', () => {
    const plan = collectSourceLineDecorationPlan({
      inCodeBlock: false,
      lineFrom: 0,
      lineText: '`x` [a](b) [[Node]] [...]'
    });

    expect(plan.footnoteMatches).toEqual([]);
    expect(plan.inlinePresentationPlans).toHaveLength(3);
    expect(plan.textDecorationPlans).toHaveLength(3);
    expect(plan.nextInCodeBlock).toBe(false);
  });
});
