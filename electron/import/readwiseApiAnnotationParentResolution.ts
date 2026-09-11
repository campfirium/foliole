import { normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import {
  bindReadwiseApiAnnotationParents,
  markReadwiseApiAnnotationParentsUnavailable
} from '../database/readwiseApiAnnotationLedger.js';
import {
  loadReadwiseApiReaderIndex,
  saveReadwiseApiReaderIndexPage,
  type ReadwiseAnnotationLedgerFact
} from '../database/readwiseApiIndexStage.js';

import {
  READER_PARENT_CATEGORIES,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import {
  READWISE_READER_LIST_URL,
  type createReadwiseApiRequest
} from './readwiseApiImportFetch.js';

export async function resolveReadwiseApiNoteParents(input: {
  connectionRef: string;
  facts: ReadwiseAnnotationLedgerFact[];
  request: ReturnType<typeof createReadwiseApiRequest>;
  runStartedAt: string;
}) {
  const indexedParents = new Map(loadReadwiseApiReaderIndex(input.connectionRef)
    .filter((item) => isParentCategory(item.category)).map((item) => [item.id, item]));
  const highlightIds = new Set(input.facts.filter((item) => item.category === 'highlight')
    .map((item) => item.remoteId));
  const notesByParent = new Map<string, string[]>();
  for (const note of input.facts.filter((item) => item.category === 'note')) {
    if (!note.parentId || highlightIds.has(note.parentId) || note.seenInRun !== input.runStartedAt) continue;
    notesByParent.set(note.parentId, [...(notesByParent.get(note.parentId) ?? []), note.remoteId]);
  }
  for (const [parentId, noteIds] of notesByParent) {
    const indexedParent = indexedParents.get(parentId);
    if (indexedParent) {
      bindReadwiseApiAnnotationParents(input.connectionRef, indexedParent.id, noteIds);
      continue;
    }
    const facts = input.facts.filter((item) => noteIds.includes(item.remoteId));
    if (facts.every((item) => item.resolution === 'parent-and-content-unavailable')) continue;
    const parent = await fetchExact(parentId, input.request);
    if (!parent) {
      markReadwiseApiAnnotationParentsUnavailable(
        input.connectionRef, noteIds, input.runStartedAt
      );
      continue;
    }
    if (parent.category === 'highlight') {
      saveReadwiseApiReaderIndexPage(input.connectionRef, [parent], input.runStartedAt);
      continue;
    }
    if (!isParentCategory(parent.category)) throw identityConflict(parentId);
    saveReadwiseApiReaderIndexPage(input.connectionRef, [parent], input.runStartedAt);
    bindReadwiseApiAnnotationParents(input.connectionRef, parent.id, noteIds);
  }
}

async function fetchExact(id: string, request: ReturnType<typeof createReadwiseApiRequest>) {
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', id);
  const payload = await request(url);
  const documents = values(payload).map(normalizeReaderDocument).filter((item) => item !== null);
  const exact = documents.find((item) => item.id === id) ?? null;
  if (!exact && documents.length) throw identityConflict(id);
  return exact;
}

function isParentCategory(value: unknown): value is ReaderParentCategory {
  return READER_PARENT_CATEGORIES.includes(value as ReaderParentCategory);
}

function identityConflict(parentId: string) {
  return new Error(`readwise_api_annotation_parent_identity_conflict:${parentId}`);
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}
