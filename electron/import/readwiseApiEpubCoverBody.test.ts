// @vitest-environment node

import { expect, it } from 'vitest';

import { placeReadwiseApiEpubCover } from './readwiseApiEpubCoverBody.js';

it('places a localized cover below the matching book heading', () => {
  expect(placeReadwiseApiEpubCover({
    body: '# Book\n\nBody\n\n[Open in Reader](https://readwise.io/read/1)',
    cover: '![Book cover](asset://cover.jpg)',
    title: 'Book'
  })).toBe([
    '# Book', '![Book cover](asset://cover.jpg)', 'Body',
    '[Open in Reader](https://readwise.io/read/1)'
  ].join('\n\n'));
});

it('replaces the generated cover without changing body images or unavailable markers', () => {
  const body = [
    '# Book', '![Book cover](asset://old.jpg)',
    '![Chapter image](asset://body.jpg)', '**Image unavailable.**'
  ].join('\n\n');
  expect(placeReadwiseApiEpubCover({
    body, cover: '![Book cover](asset://new.jpg)', title: 'Book'
  })).toBe([
    '# Book', '![Book cover](asset://new.jpg)',
    '![Chapter image](asset://body.jpg)', '**Image unavailable.**'
  ].join('\n\n'));
});

it('is idempotent for the same cover', () => {
  const body = '# Book\n\n![Book cover](asset://cover.jpg)\n\nBody';
  expect(placeReadwiseApiEpubCover({
    body, cover: '![Book cover](asset://cover.jpg)', title: 'Book'
  })).toBe(body);
});
