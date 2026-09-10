import { describe, expect, it } from 'vitest';

import {
  buildCanonicalAttachmentStorageKey,
  canonicalAttachmentExtension,
  isCanonicalAttachmentStorageKey,
  parseCanonicalAttachmentStorageKey
} from './attachmentResource.js';

const HASH = 'a'.repeat(64);

describe('canonical attachment storage keys', () => {
  it.each([
    ['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/gif', '.gif'],
    ['image/webp', '.webp'], ['application/pdf', '.pdf']
  ])('maps %s to %s', (mimeType, extension) => {
    expect(canonicalAttachmentExtension(mimeType)).toBe(extension);
    expect(buildCanonicalAttachmentStorageKey(HASH, mimeType)).toBe(`${HASH}${extension}`);
  });

  it('rejects aliases, unknown types, invalid hashes, and path syntax', () => {
    expect(parseCanonicalAttachmentStorageKey(`${HASH}.jpeg`)).toBeNull();
    expect(parseCanonicalAttachmentStorageKey(`${HASH}.JPG`)).toBeNull();
    expect(parseCanonicalAttachmentStorageKey(`../${HASH}.png`)).toBeNull();
    expect(buildCanonicalAttachmentStorageKey(HASH.toUpperCase(), 'image/png')).toBeNull();
    expect(buildCanonicalAttachmentStorageKey(HASH, 'application/octet-stream')).toBeNull();
  });

  it('round-trips the full storage key', () => {
    expect(parseCanonicalAttachmentStorageKey(`${HASH}.jpg`)).toEqual({
      contentHash: HASH,
      mimeType: 'image/jpeg',
      storageKey: `${HASH}.jpg`
    });
    expect(isCanonicalAttachmentStorageKey(`${HASH}.jpg`, HASH, 'image/jpeg')).toBe(true);
  });
});
