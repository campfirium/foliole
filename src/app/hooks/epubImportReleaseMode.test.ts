import { expect, it } from 'vitest';

import {
  detectEpubPreviewHighlights,
  resolveDefaultEpubReleaseMode
} from './epubImportReleaseMode';

it('defaults EPUB imports with Highlight markers to free reading', () => {
  expect(detectEpubPreviewHighlights('A paragraph with ==marked text==.')).toBe(true);
  expect(resolveDefaultEpubReleaseMode('A paragraph with ==marked text==.')).toBe('free');
});

it('defaults EPUB imports without Highlights to sequential reading', () => {
  expect(detectEpubPreviewHighlights('A chapter without marked text.')).toBe(false);
  expect(resolveDefaultEpubReleaseMode('A chapter without marked text.')).toBe('sequential');
});
