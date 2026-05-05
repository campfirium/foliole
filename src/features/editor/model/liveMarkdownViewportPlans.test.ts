import { describe, expect, it } from 'vitest';

import { collectPreviewViewportPlans, collectSourceViewportPlans } from './liveMarkdownViewportPlans';

describe('liveMarkdownViewportPlans', () => {
  it('threads preview line plans through code fence state', () => {
    const plans = collectPreviewViewportPlans({
      codeFenceLineFroms: new Set([0, 13]),
      codeLineFroms: new Set([6]),
      cursorLineNumber: 2,
      hideTitleHeading: false,
      lines: [
        { from: 0, lineNumber: 1, text: '```ts' },
        { from: 6, lineNumber: 2, text: '# Title' },
        { from: 13, lineNumber: 3, text: '```' }
      ],
      markdownSyntaxVisible: true,
      startInCodeBlock: false
    });

    expect(plans.map((item) => item.plan.isCodeFenceLine)).toEqual([true, false, true]);
    expect(plans[0]?.plan.showSyntaxOnLine).toBe(false);
    expect(plans[1]?.plan.prefixVisible).toBe(false);
  });

  it('uses parser-backed thematic break line state', () => {
    const plans = collectPreviewViewportPlans({
      cursorLineNumber: null,
      hideTitleHeading: false,
      lines: [
        { from: 0, lineNumber: 1, text: 'Before' },
        { from: 7, lineNumber: 2, text: '---' }
      ],
      markdownSyntaxVisible: false,
      startInCodeBlock: false,
      thematicBreakLineFroms: new Set([7])
    });

    expect(plans[0]?.plan.isThematicBreak).toBe(false);
    expect(plans[1]?.plan.isThematicBreak).toBe(true);
  });

  it('threads source line plans through code fence state', () => {
    const plans = collectSourceViewportPlans({
      codeFenceLineFroms: new Set([0, 16]),
      codeLineFroms: new Set([6]),
      lines: [
        { from: 0, lineNumber: 1, text: '```ts' },
        { from: 6, lineNumber: 2, text: '`x` [a](b)' },
        { from: 16, lineNumber: 3, text: '```' }
      ],
      startInCodeBlock: false
    });

    expect(plans.map((item) => item.plan.isCodeFenceLine)).toEqual([true, false, true]);
    expect(plans[1]?.plan.textDecorationPlans).toHaveLength(2);
  });
});
