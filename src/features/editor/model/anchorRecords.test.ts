import { expect, it } from 'vitest';

import { buildAnchorDisplayPlan, collectAnchorRecords } from './anchorRecords';

it('collects anchor records with normalized text and content ranges', () => {
  const content = 'A<highlight id="anchor-1">BC</highlight id="anchor-1">D';

  expect(collectAnchorRecords(content)).toEqual([
    {
      closeTagFrom: content.indexOf('</highlight id="anchor-1">'),
      closeTagTo: content.indexOf('</highlight id="anchor-1">') + '</highlight id="anchor-1">'.length,
      from: content.indexOf('BC'),
      id: 'anchor-1',
      kind: 'highlight',
      openTagFrom: content.indexOf('<highlight id="anchor-1">'),
      openTagTo: content.indexOf('<highlight id="anchor-1">') + '<highlight id="anchor-1">'.length,
      text: 'BC',
      to: content.indexOf('</highlight id="anchor-1">')
    }
  ]);
});

it('keeps zero-width anchors as records with empty text', () => {
  const content = 'A<highlight id="anchor-1"></highlight id="anchor-1">D';

  expect(collectAnchorRecords(content)).toEqual([
    {
      closeTagFrom: content.indexOf('</highlight id="anchor-1">'),
      closeTagTo: content.indexOf('</highlight id="anchor-1">') + '</highlight id="anchor-1">'.length,
      from: content.indexOf('</highlight id="anchor-1">'),
      id: 'anchor-1',
      kind: 'highlight',
      openTagFrom: content.indexOf('<highlight id="anchor-1">'),
      openTagTo: content.indexOf('<highlight id="anchor-1">') + '<highlight id="anchor-1">'.length,
      text: '',
      to: content.indexOf('</highlight id="anchor-1">')
    }
  ]);
});

it('builds a display plan that keeps merged highlight coverage and hidden tag ranges aligned', () => {
  const content = 'X<highlight id="a">12<cloze id="b">34</highlight id="a">56</cloze id="b">Y';

  expect(buildAnchorDisplayPlan(content)).toEqual({
    clozeRanges: [{ from: content.indexOf('34'), to: content.indexOf('56') + 2 }],
    highlightOverlapRanges: [],
    highlightRanges: [{ from: content.indexOf('12'), to: content.indexOf('34') + 2 }],
    mixedOverlapRanges: [{ from: content.indexOf('34'), to: content.indexOf('34') + 2 }],
    tokenRanges: [
      { from: content.indexOf('<highlight id="a">'), to: content.indexOf('12') },
      { from: content.indexOf('<cloze id="b">'), to: content.indexOf('34') },
      { from: content.indexOf('</highlight id="a">'), to: content.indexOf('56') },
      { from: content.indexOf('</cloze id="b">'), to: content.indexOf('Y') }
    ]
  });
});
