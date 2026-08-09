import { expect, it } from 'vitest';

import { parseCompanionContentBlobMultipart } from './companionContentBlobMultipart.js';

it('parses the established multipart content blob response', () => {
  const hash = 'a'.repeat(64);
  const body = Buffer.from(`--test\r\nContent-Type: text/plain\r\nContent-Length: 4\r\nX-Blob-Hash: ${hash}\r\n\r\nbody\r\n--test--\r\n`);
  expect(parseCompanionContentBlobMultipart(body, 'multipart/mixed; boundary=test')).toEqual([
    { body: Buffer.from('body'), hash }
  ]);
});

it('rejects truncated batches', () => {
  expect(() => parseCompanionContentBlobMultipart(Buffer.from('--test'), 'multipart/mixed; boundary=test'))
    .toThrow('content_blob_batch_truncated');
});
