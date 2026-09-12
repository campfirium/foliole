import { expect, it } from 'vitest';

import { buildAssetMarkdownUrl, buildCanonicalAssetMarkdownUrl, parseAssetMarkdownUrl } from './assetMarkdownUrl.js';

const STORAGE_KEY = `${'b'.repeat(64)}.png`;

it('round-trips a canonical storage key without deriving an attachment id', () => {
  expect(buildAssetMarkdownUrl(STORAGE_KEY)).toBe(`asset://${STORAGE_KEY}`);
  expect(parseAssetMarkdownUrl(`asset://${STORAGE_KEY}`)).toBe(STORAGE_KEY);
});

it('builds canonical image addresses without emitting jpeg aliases', () => {
  expect(buildCanonicalAssetMarkdownUrl('a'.repeat(64), 'image/jpeg')).toBe(`asset://${'a'.repeat(64)}.jpg`);
});

it.each([
  `asset://${'b'.repeat(64)}`,
  `asset://${'b'.repeat(64)}.jpeg`,
  'asset://../outside.png',
  'https://example.com/image.png'
])('rejects a non-canonical target: %s', (target) => {
  expect(parseAssetMarkdownUrl(target)).toBeNull();
});
