// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeReadwiseApiDocumentImportState } from './readwiseApiImportState.js';

it('normalizes synced materialization and intake-blocking state deterministically', () => {
  expect(normalizeReadwiseApiDocumentImportState({
    annotations: [{
      blockedAt: '2026-09-07T00:00:00.000Z', contentHash: 'hash', kind: 'highlight',
      nodeId: 'node-1', parentRemoteId: 'doc', remoteId: 'highlight-1', sourceUpdatedAt: null
    }],
    bodyState: 'materialized',
    documentBlockedAt: null,
    metadata: { title: 'Title' },
    sourceUpdatedAt: '2026-09-06T00:00:00.000Z',
    version: 1
  })).toMatchObject({
    annotations: [{ blockedAt: '2026-09-07T00:00:00.000Z', remoteId: 'highlight-1' }],
    bodyState: 'materialized',
    metadata: { title: 'Title' },
    version: 1
  });
});
