import { describe, expect, it } from 'vitest';

import { collectMarkdownMathRanges } from './markdownMathRanges';

describe('collectMarkdownMathRanges', () => {
  it('collects inline dollar and paren formulas', () => {
    expect(collectMarkdownMathRanges('Energy is $E=mc^2$ and \\(a+b\\).')).toEqual([
      expect.objectContaining({ display: 'inline', source: '$E=mc^2$', tex: 'E=mc^2' }),
      expect.objectContaining({ display: 'inline', source: '\\(a+b\\)', tex: 'a+b' })
    ]);
  });

  it('does not treat escaped dollars or currency values as formulas', () => {
    expect(collectMarkdownMathRanges('Cost is $20 and escaped \\$x$ text.')).toEqual([]);
  });

  it('collects standalone dollar and bracket display formulas', () => {
    expect(collectMarkdownMathRanges('Before\n$$\na^2+b^2=c^2\n$$\nAfter')).toEqual([
      expect.objectContaining({ display: 'block', tex: 'a^2+b^2=c^2' })
    ]);
    expect(collectMarkdownMathRanges('\\[\n\\frac{1}{2}\n\\]')).toEqual([
      expect.objectContaining({ display: 'block', tex: '\\frac{1}{2}' })
    ]);
  });

  it('does not parse dollar fences inside fenced code', () => {
    expect(collectMarkdownMathRanges('```tex\n$$\nx\n$$\n```')).toEqual([]);
  });
});
