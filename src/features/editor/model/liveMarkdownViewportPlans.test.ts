import { describe, expect, it } from 'vitest';

import { collectPreviewViewportPlans, collectSourceViewportPlans } from './liveMarkdownViewportPlans';

describe('liveMarkdownViewportPlans', () => {
  it('threads preview line plans through code fence state', () => {
    const plans = collectPreviewViewportPlans({
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

    expect(plans.map((item) => item.plan.nextInCodeBlock)).toEqual([true, true, false]);
    expect(plans[0]?.plan.showSyntaxOnLine).toBe(false);
    expect(plans[1]?.plan.prefixVisible).toBe(false);
  });

  it('threads source line plans through code fence state', () => {
    const plans = collectSourceViewportPlans({
      lines: [
        { from: 0, lineNumber: 1, text: '```ts' },
        { from: 6, lineNumber: 2, text: '`x` [a](b)' },
        { from: 16, lineNumber: 3, text: '```' }
      ],
      startInCodeBlock: false
    });

    expect(plans.map((item) => item.plan.nextInCodeBlock)).toEqual([true, true, false]);
    expect(plans[1]?.plan.textDecorationPlans).toHaveLength(2);
  });
});
