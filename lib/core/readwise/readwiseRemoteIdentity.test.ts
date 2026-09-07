import { expect, it } from 'vitest';

import {
  extractReaderLinkIds,
  normalizeReadwiseRemoteSource,
  normalizeRemoteAnnotationBindings
} from './readwiseRemoteIdentity.js';

it('extracts stable Reader ids without treating other URLs as identity', () => {
  expect(extractReaderLinkIds([
    '[Reader](https://read.readwise.io/read/doc_1)',
    '[Reader](https://readwise.io/library/read/highlight-2)',
    '[Source](https://example.com/read/weak)'
  ].join('\n'))).toEqual(['doc_1', 'highlight-2']);
});

it('normalizes connection and annotation identity deterministically', () => {
  expect(normalizeReadwiseRemoteSource({
    connectionRef: 'readwise-source', createdAt: 'created', updatedAt: 'updated', version: 1
  })).toMatchObject({ connectionRef: 'readwise-source', version: 1 });
  expect(normalizeReadwiseRemoteSource({ connectionRef: 'readwise-source', version: 2 })).toBeNull();
  expect(normalizeRemoteAnnotationBindings([
    { kind: 'note', nodeId: 'node-b', remoteId: 'remote-b' },
    { kind: 'highlight', nodeId: 'node-a', remoteId: 'remote-a' },
    { kind: 'highlight', nodeId: 'ignored-duplicate', remoteId: 'remote-a' },
    { kind: 'document', nodeId: 'ignored', remoteId: 'ignored' }
  ])).toEqual([
    { kind: 'highlight', nodeId: 'ignored-duplicate', remoteId: 'remote-a' },
    { kind: 'note', nodeId: 'node-b', remoteId: 'remote-b' }
  ]);
});
