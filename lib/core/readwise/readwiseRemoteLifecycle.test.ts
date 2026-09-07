// @vitest-environment node

import { expect, it } from 'vitest';

import {
  ALL_READWISE_RECONCILE_SCOPE,
  normalizeReadwiseReconcileExportBook,
  normalizeReadwiseRemoteLifecycle
} from './readwiseRemoteLifecycle.js';

it('keeps only typed full-reconcile scope and deletion facts', () => {
  expect(normalizeReadwiseRemoteLifecycle({
    checkedAt: '2026-09-08T00:00:00.000Z', connectionRef: 'connection', export: 'deleted',
    reader: 'missing', scope: ALL_READWISE_RECONCILE_SCOPE
  })).toMatchObject({ export: 'deleted', reader: 'missing', scope: { readerLocation: 'all' } });
  expect(normalizeReadwiseRemoteLifecycle({
    connectionRef: 'connection', export: 'deleted', reader: 'missing', scope: { readerLocation: 'later', version: 0 }
  })).toBeNull();
});

it('retains exact Reader Export object deletion facts', () => {
  expect(normalizeReadwiseReconcileExportBook({
    external_id: 'document', highlights: [
      { external_id: 'highlight-present', is_deleted: false },
      { external_id: 'highlight-deleted', is_deleted: true }
    ], is_deleted: true, source: 'reader'
  })).toEqual({
    externalId: 'document', highlights: [
      { externalId: 'highlight-present', isDeleted: false },
      { externalId: 'highlight-deleted', isDeleted: true }
    ], isDeleted: true, source: 'reader'
  });
});
