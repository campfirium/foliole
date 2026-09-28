import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';

import type { ReadwiseApiCandidate, ReaderParentCategory } from './readwiseApiCandidateTypes.js';

export function createReadwiseApiCandidateRecord(
  parent: NonNullable<ReturnType<typeof normalizeReaderDocument>>,
  destination: 'external' | 'inbox',
  hasHighlights: boolean,
  highlightIds: string[],
  noteIds: string[],
  matchedImportTag: boolean
): ReadwiseApiCandidate {
  return {
    destination,
    documentId: parent.id,
    exportCategory: null,
    hasHighlights,
    highlightIds,
    noteIds,
    matchedImportTag,
    readerCategory: parent.category as ReaderParentCategory,
    status: 'pending',
    title: parent.title
  };
}
