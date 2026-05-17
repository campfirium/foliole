// @vitest-environment node

import { expect, it } from 'vitest';

import { readImageIntrinsicSize } from './imageIntrinsicSize.js';

it('reads PNG dimensions from the image header', () => {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x05, 0x00,
    0x00, 0x00, 0x03, 0xc0
  ]);

  expect(readImageIntrinsicSize(bytes)).toEqual({ height: 960, width: 1280 });
});

it('reads JPEG dimensions from a start-of-frame segment', () => {
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0,
    0x00, 0x04,
    0x00, 0x00,
    0xff, 0xc0,
    0x00, 0x0b,
    0x08,
    0x03, 0xc0,
    0x05, 0x00,
    0x03,
    0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);

  expect(readImageIntrinsicSize(bytes)).toEqual({ height: 960, width: 1280 });
});

it('returns null when image dimensions cannot be read', () => {
  expect(readImageIntrinsicSize(new Uint8Array([1, 2, 3]))).toBeNull();
});
