import { describe, expect, it } from 'vitest';

import { decodeTextBodyBlobData } from './contentBodyBlobs';

describe('content body blob decoding', () => {
  it('decodes sqlite text blobs from supported binary shapes', () => {
    const text = 'Guide body';
    const bytes = Buffer.from(text, 'utf8');

    expect(decodeTextBodyBlobData(bytes)).toBe(text);
    expect(decodeTextBodyBlobData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))).toBe(text);
  });
});
