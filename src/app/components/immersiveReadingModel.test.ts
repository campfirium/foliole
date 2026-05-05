import { expect, it } from 'vitest';

import { getParagraphSelections, resolveParagraphSelection } from './immersiveReadingModel';

it('collects paragraph ranges separated by blank lines', () => {
  expect(getParagraphSelections('Alpha line\nstill alpha\n\nBeta\n\n  \nGamma')).toEqual([
    { from: 0, to: 22 },
    { from: 24, to: 28 },
    { from: 33, to: 38 }
  ]);
});

it('treats markdown headings and list items as standalone reading blocks', () => {
  expect(getParagraphSelections('## Metadata\n- One\n- Two\n\nPlain text')).toEqual([
    { from: 0, to: 11 },
    { from: 12, to: 17 },
    { from: 18, to: 23 },
    { from: 25, to: 35 }
  ]);
});

it('selects the current paragraph first, then advances to the next paragraph', () => {
  const content = 'Alpha line\nstill alpha\n\nBeta\n\nGamma';

  expect(
    resolveParagraphSelection({
      content,
      currentSelection: { from: 3, to: 3 },
      direction: 'forward'
    })
  ).toEqual({ from: 0, to: 22 });

  expect(
    resolveParagraphSelection({
      content,
      currentSelection: { from: 0, to: 22 },
      direction: 'forward'
    })
  ).toEqual({ from: 24, to: 28 });
});

it('returns null when moving past the last paragraph', () => {
  expect(
    resolveParagraphSelection({
      content: 'Alpha\n\nBeta',
      currentSelection: { from: 7, to: 11 },
      direction: 'forward'
    })
  ).toBeNull();
});
