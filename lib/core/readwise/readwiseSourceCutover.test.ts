import { expect, it } from 'vitest';

import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';
import {
  filterPostCutoverReadwiseDocument,
  normalizeReadwiseSourceCutover,
  readwiseSourceCutoverProgress,
  READWISE_SOURCE_CUTOVER_VERSION,
  type ReadwiseSourceCutover
} from './readwiseSourceCutover.js';

const state: ReadwiseSourceCutover = {
  annotations: [
    { nodeId: 'old-highlight', remoteId: 'highlight-old', status: 'bound' },
    { nodeId: null, remoteId: 'highlight-suppressed', status: 'suppressed' }
  ],
  cohortDocumentIds: ['document-old', 'document-suppressed'],
  completedAt: '2026-09-09T01:00:00.000Z',
  documents: [
    { nodeId: 'old-topic', remoteId: 'document-old', status: 'bound' },
    { nodeId: null, remoteId: 'document-suppressed', status: 'suppressed' }
  ],
  retiredNodeIds: [],
  sourceHost: 'Mac',
  startedAt: '2026-09-09T00:00:00.000Z',
  status: 'api',
  version: READWISE_SOURCE_CUTOVER_VERSION
};

it('accepts an exact v2 cohort and derives honest progress from its journal', () => {
  const normalized = normalizeReadwiseSourceCutover(state);
  expect(normalized).toEqual(state);
  expect(normalized && readwiseSourceCutoverProgress(normalized)).toEqual({
    completedCandidateCount: 2,
    migratedCount: 1,
    totalCandidateCount: 2,
    unmatchedCount: 1
  });
});

it('keeps post-cutover old classifications outside the frozen cohort', () => {
  const extended = {
    ...state,
    documents: [
      ...state.documents,
      { nodeId: null, remoteId: 'document-late-old', status: 'suppressed' as const }
    ]
  };
  expect(normalizeReadwiseSourceCutover(extended)).toEqual(extended);
  expect(readwiseSourceCutoverProgress(extended)).toMatchObject({
    completedCandidateCount: 2,
    unmatchedCount: 1
  });
});

it('fails closed for unknown versions and incomplete completed cohorts', () => {
  expect(() => normalizeReadwiseSourceCutover({ version: 0 })).toThrow('unknown_version');
  expect(() => normalizeReadwiseSourceCutover({ ...state, documents: [] })).toThrow('incomplete_cohort');
  expect(normalizeReadwiseSourceCutover(null)).toBeNull();
});

it('suppresses pre-cutover copies while allowing new Reader material', () => {
  expect(filterPostCutoverReadwiseDocument(state, document('document-suppressed', '2026-09-08'))).toBeNull();
  const bound = filterPostCutoverReadwiseDocument(state, {
    ...document('document-old', '2026-09-08'),
    annotations: [
      annotation('highlight-old', '2026-09-08'),
      annotation('highlight-suppressed', '2026-09-08'),
      annotation('highlight-new', '2026-09-10')
    ]
  });
  expect(bound?.annotations.map((item) => item.remoteId)).toEqual(['highlight-old', 'highlight-new']);
  expect(filterPostCutoverReadwiseDocument(state, document('document-new', '2026-09-10'))).not.toBeNull();
  expect(filterPostCutoverReadwiseDocument(state, document('document-unclassified-old', '2026-09-08'))).toBeNull();
  expect(filterPostCutoverReadwiseDocument(state, {
    ...document('document-unknown-date', '2026-09-10'), createdAt: null
  })).toBeNull();
});

it('allows an exact stored binding while filtering unclassified old annotations', () => {
  const guarded = filterPostCutoverReadwiseDocument(state, {
    ...document('document-late-old', '2026-09-08'),
    annotations: [
      annotation('highlight-exact', '2026-09-08'),
      { ...annotation('highlight-unknown', '2026-09-10'), createdAt: null }
    ]
  }, { annotationRemoteIds: new Set(['highlight-exact']) });
  expect(guarded?.annotations.map((item) => item.remoteId)).toEqual(['highlight-exact']);
});

function document(id: string, createdAt: string): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: 'body', category: 'article', coverImageUrl: null, createdAt,
    degradedReason: null, id, metadata: { author: null, category: 'article', readerUrl: null,
      sourceUrl: null, title: id }, title: id, unmatchedAnnotationCount: 0, updatedAt: createdAt
  };
}

function annotation(remoteId: string, createdAt: string): PreparedReadwiseApiDocument['annotations'][number] {
  return {
    content: remoteId, contentHash: remoteId, createdAt, kind: 'highlight', locatorText: remoteId,
    parentRemoteId: 'document-old', remoteId, updatedAt: createdAt
  };
}
