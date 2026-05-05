import { expect, it } from 'vitest';

import { collectDocumentHighlights } from './documentHighlights';

it('collects highlight items in document order', () => {
  expect(
    collectDocumentHighlights(
      '# Title\n\nA <highlight id="1">first bit</highlight id="1"> and <highlight id="2">second bit</highlight id="2">.'
    )
  ).toEqual([
    { id: '1', text: 'first bit' },
    { id: '2', text: 'second bit' }
  ]);
});

it('strips nested anchor markup and collapses whitespace', () => {
  expect(
    collectDocumentHighlights(
      '<highlight id="1">Alpha <cloze id="2">Beta</cloze id="2">\nGamma</highlight id="1">'
    )
  ).toEqual([{ id: '1', text: 'Alpha Beta Gamma' }]);
});

it('drops empty highlights', () => {
  expect(collectDocumentHighlights('<highlight id="1">   </highlight id="1">')).toEqual([]);
});
