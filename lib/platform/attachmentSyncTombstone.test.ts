import { expect, it } from 'vitest';

import { parseAttachmentSyncTombstone } from './attachmentSyncTombstone.js';

it('accepts only complete path-safe attachment tombstone identities', () => {
  const valid = { attachment_id: 'att-1', content_hash: 'a'.repeat(64), mime_type: 'image/png', storage_key: 'att-1' };
  expect(parseAttachmentSyncTombstone(valid)).toEqual(valid);
  expect(() => parseAttachmentSyncTombstone({ ...valid, content_hash: 'short' })).toThrow('Invalid');
  expect(() => parseAttachmentSyncTombstone({ ...valid, storage_key: '../att-1' })).toThrow('Invalid');
  expect(() => parseAttachmentSyncTombstone({ ...valid, mime_type: '' })).toThrow('Invalid');
});
