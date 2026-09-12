import { expect, it } from 'vitest';

import { placeReadwiseApiEpubHighlight } from './readwiseApiEpubHighlightPlacement.js';

const bodies = [
  { id: 'root', content: 'Front matter' },
  { id: 'chapter-one', content: 'A repeated phrase.' },
  { id: 'chapter-two', content: 'A repeated phrase. 这是只在第二章出现的唯一长句[1]，并带有来源标记。' }
];

function highlight(locatorText: string) {
  return { content: locatorText, label: null, locatorText, nodeId: 'highlight' };
}

it('places an exact unique EPUB highlight in its chapter instead of the root', () => {
  expect(placeReadwiseApiEpubHighlight({
    bodies,
    highlight: highlight('这是只在第二章出现的唯一长句[1]，并带有来源标记。'),
    rootNodeId: 'root'
  })).toMatchObject({ parentId: 'chapter-two' });
});

it('uses a unique long fragment when source markup prevents a full-quote match', () => {
  expect(placeReadwiseApiEpubHighlight({
    bodies,
    highlight: highlight('这是只在第二章出现的唯一长句，但来源标记与正文不同。'),
    rootNodeId: 'root'
  })).toEqual({
    highlight: expect.objectContaining({ locatorText: '这是只在第二章出现的唯一长句' }),
    parentId: 'chapter-two'
  });
});

it('keeps an ambiguous highlight unanchored at the EPUB root', () => {
  expect(placeReadwiseApiEpubHighlight({
    bodies,
    highlight: highlight('A repeated phrase.'),
    rootNodeId: 'root'
  })).toEqual({
    highlight: expect.objectContaining({ locatorText: null }),
    parentId: 'root'
  });
});

it('anchors front-matter highlights in the EPUB root body', () => {
  expect(placeReadwiseApiEpubHighlight({
    bodies,
    highlight: highlight('Front matter'),
    rootNodeId: 'root'
  })).toMatchObject({ parentId: 'root', highlight: { locatorText: 'Front matter' } });
});
