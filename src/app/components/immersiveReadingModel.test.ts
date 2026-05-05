import { expect, it } from 'vitest';

import { getParagraphSelections, resolveCurrentParagraphSelection, resolveParagraphSelection } from './immersiveReadingModel';

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

it('treats contiguous markdown table rows as a standalone reading block', () => {
  const content = 'Intro\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\nOutro';

  expect(getParagraphSelections(content)).toEqual([
    { from: 0, to: 5 },
    { from: 7, to: 47 },
    { from: 49, to: 54 }
  ]);
  expect(resolveCurrentParagraphSelection(content, { from: 20, to: 20 })).toEqual({ from: 7, to: 47 });
});

it('treats a standalone markdown image line as its own reading block', () => {
  const content = 'Alpha\n\n![Cover](asset://hash-1.png)\n\nGamma';

  expect(getParagraphSelections(content)).toEqual([
    { from: 0, to: 5 },
    { from: 7, to: 35 },
    { from: 37, to: 42 }
  ]);
  expect(resolveCurrentParagraphSelection(content, { from: 10, to: 10 })).toEqual({ from: 7, to: 35 });
});

it('selects the current paragraph before advancing when given only a point', () => {
  const content = 'Alpha line\nstill alpha\n\nBeta\n\nGamma';

  expect(
    resolveParagraphSelection({
      content,
      currentSelection: { from: 3, to: 3 },
      direction: 'forward'
    })
  ).toEqual({ from: 0, to: 22 });
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
