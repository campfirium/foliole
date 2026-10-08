import { describe, expect, it } from 'vitest';

import { requireResolvedNodeBody, resolveNodeBody } from './nodeBodyResolution.js';

describe('node body resolution', () => {
  it('reads owned node text even when an obsolete shared copy disagrees', () => {
    expect(resolveNodeBody({ body_blob_data: Buffer.from('Old shared text'), body_blob_hash: 'hash-1', content: 'Current body' }))
      .toEqual({ bodyBlobHash: 'hash-1', content: 'Current body', source: 'node', status: 'resolved' });
  });

  it('reads complete text without a hash', () => {
    expect(resolveNodeBody({ body_blob_hash: null, content: 'Owned body' }))
      .toEqual({ bodyBlobHash: null, content: 'Owned body', source: 'node', status: 'resolved' });
  });

  it('keeps an empty owned body readable without shared data', () => {
    expect(requireResolvedNodeBody({ body_blob_hash: 'hash-1', content: '' }))
      .toEqual({ bodyBlobHash: 'hash-1', content: '', source: 'node', status: 'resolved' });
  });
});
