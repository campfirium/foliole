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
    bodyAuthority: 'reader_html',
    documentBlockedAt: null,
    metadata: { title: 'Title' },
    sourceUpdatedAt: '2026-09-06T00:00:00.000Z',
    version: 1
  })).toMatchObject({
    annotations: [{
      blockedAt: '2026-09-07T00:00:00.000Z', remoteId: 'highlight-1', remoteStatus: 'unconfirmed'
    }],
    bodyState: 'materialized',
    metadata: { title: 'Title' },
    originalFile: null,
    remoteLifecycle: null,
    sourceUpdate: null,
    version: 5
  });
});

it('keeps only complete localized or explicit degraded original-file states', () => {
  expect(normalizeReadwiseApiDocumentImportState({
    originalFile: {
      attachmentId: 'hash', contentHash: 'hash', mimeType: 'application/pdf',
      sizeBytes: 42, status: 'localized'
    }
  }).originalFile).toEqual({
    attachmentId: 'hash', contentHash: 'hash', mimeType: 'application/pdf', reason: null,
    sizeBytes: 42, status: 'localized'
  });
  expect(normalizeReadwiseApiDocumentImportState({
    originalFile: { reason: 'original_file_too_large', status: 'html_only' }
  }).originalFile).toMatchObject({ reason: 'original_file_too_large', status: 'html_only' });
  expect(normalizeReadwiseApiDocumentImportState({
    originalFile: { attachmentId: 'hash', status: 'localized' }
  }).originalFile).toBeNull();
});
