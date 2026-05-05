// @vitest-environment node

import { expect, it } from 'vitest';

import { toPdfDocumentData } from './pdfIndexing.js';

it('normalizes Buffer bytes to Uint8Array for pdfjs loading', () => {
  const buffer = Buffer.from([1, 2, 3, 4]);
  const normalized = toPdfDocumentData(buffer);

  expect(normalized).toBeInstanceOf(Uint8Array);
  expect(Buffer.isBuffer(normalized)).toBe(false);
  expect(Array.from(normalized)).toEqual([1, 2, 3, 4]);
});
