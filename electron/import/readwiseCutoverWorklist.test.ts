import { expect, it } from 'vitest';

import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { planCutoverWorklist } from './readwiseCutoverWorklistPlan.js';

it('includes a matched dismissed document as an existing update', () => {
  const documents = [document('matched'), document('new'), document('off')];
  const destinations = new Map([
    ['matched', 'off' as const],
    ['new', 'inbox' as const],
    ['off', 'off' as const]
  ]);
  const previous = [{ nodeId: null, remoteId: 'matched', status: 'suppressed' as const }];

  const plan = planCutoverWorklist(documents, destinations, (item) => item.id === 'matched' ? {
    annotations: [], blockedAnnotationIds: new Set(), legacyAnnotations: [], nodeId: 'local-topic',
    remoteDocumentId: item.id, sourceFingerprint: 'legacy-source'
  } : null, previous, new Set());

  expect(plan.items).toEqual([
    expect.objectContaining({ destination: 'inbox', remoteId: 'matched', binding: expect.objectContaining({ nodeId: 'local-topic' }) }),
    { binding: null, destination: 'inbox', remoteId: 'new' }
  ]);
  expect(plan.summary).toEqual({ newImport: 1, skipped: 1, updateExisting: 1 });
});

function document(id: string): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: '', category: 'article', coverImageUrl: null, degradedReason: null, id,
    metadata: {
      author: null, category: 'article', readerUrl: `https://readwise.io/reader/read/${id}`,
      sourceUrl: null, title: id
    },
    title: id, unmatchedAnnotationCount: 0, updatedAt: null
  };
}
