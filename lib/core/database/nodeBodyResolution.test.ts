import { describe, expect, it } from 'vitest';

import { NodeBodyUnavailableError, requireResolvedNodeBody, resolveNodeBody } from './nodeBodyResolution.js';

describe('node body resolution', () => {
  it('uses Blob data as the authority when a hash exists', () => {
    expect(resolveNodeBody({ body_blob_data: Buffer.from('Blob body'), body_blob_hash: 'hash-1', content: 'stale inline' }))
      .toEqual({ bodyBlobHash: 'hash-1', content: 'Blob body', source: 'blob', status: 'resolved' });
  });

  it('uses inline content only for a node without a Blob hash', () => {
    expect(resolveNodeBody({ body_blob_data: null, body_blob_hash: null, content: 'Legacy body' }))
      .toEqual({ bodyBlobHash: null, content: 'Legacy body', source: 'legacy_inline', status: 'resolved' });
  });

  it('reports a hashed node without local Blob data as unavailable', () => {
    expect(resolveNodeBody({ body_blob_data: null, body_blob_hash: 'hash-1', content: 'stale inline' }))
      .toEqual({ bodyBlobHash: 'hash-1', status: 'unavailable' });
    expect(() => requireResolvedNodeBody(
      { body_blob_data: null, body_blob_hash: 'hash-1', content: 'stale inline' },
      'node-1'
    )).toThrow(NodeBodyUnavailableError);
  });
});
