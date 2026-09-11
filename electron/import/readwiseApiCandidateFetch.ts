import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import {
  enabledReadwiseReaderCategories,
  resolveReadwiseAutoImportDestination
} from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { normalizeExportBook, normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import {
  advanceReadwiseApiCandidateRun,
  loadOrCreateReadwiseApiCandidateRun,
  restartReadwiseApiCandidateRun,
  saveReadwiseApiCandidateCursor
} from '../database/readwiseApiCandidateRun.js';
import {
  loadReadwiseApiCandidates,
  saveReadwiseApiCandidateExportPage,
  saveReadwiseApiCandidateFacts,
  saveReadwiseApiCandidates
} from '../database/readwiseApiCandidateStage.js';
import { hideReadwiseApiExternalDocumentsExcept } from '../database/readwiseApiExternalDocuments.js';

import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import {
  READER_PARENT_CATEGORIES,
  type ReadwiseApiCandidate,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import {
  createReadwiseApiRequest,
  READWISE_EXPORT_URL,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { assertReadwiseApiScopeAllowed, type ReadwiseApiScopePurpose } from './readwiseApiScopeGate.js';

const MISSING_PARENT_ATTEMPTS = 3;

export async function ensureReadwiseApiCandidateIndex(
  settings: ImportManagerSettings,
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {},
  purpose: ReadwiseApiScopePurpose = 'api'
) {
  assertReadwiseApiScopeAllowed(purpose);
  let run = loadOrCreateReadwiseApiCandidateRun(connectionRef, settings.readwiseAutoImportPolicy);
  const request = createReadwiseApiRequest(dependencies);
  try {
    while (run.phase !== 'ready') {
      const url = buildIndexUrl(run.phase, run.cursor, run.queryUpdatedAfter);
      const payload = await request(url);
      const cursor = nextCursor(payload);
      if (run.phase === 'export') {
        const books = values(payload).map(normalizeExportBook).filter((item) => item !== null);
        saveReadwiseApiCandidateExportPage(connectionRef, books);
        for (const book of books) {
          if (book.source !== 'reader' || book.isDeleted || !book.externalId) continue;
          const parent = await fetchExact(book.externalId, false, request);
          if (!parent || !isReaderParentCategory(parent.category)) continue;
          saveReadwiseApiCandidates(connectionRef, exportCandidate(book, parent, settings));
        }
      } else {
        const category = run.phase.slice('reader:'.length) as ReaderParentCategory;
        const documents = values(payload).map(normalizeReaderDocument).filter((item) => item !== null);
        saveReadwiseApiCandidates(connectionRef, documents.flatMap((document) =>
          document.category === category ? readerCandidate(document, settings) : []
        ));
      }
      dependencies.onPage?.({ phase: run.phase === 'export' ? 'export' : 'reader', recordCount: values(payload).length });
      if (cursor) {
        saveReadwiseApiCandidateCursor({ connectionRef, cursor, phase: run.phase });
        run = { ...run, cursor };
      } else {
        run = advanceReadwiseApiCandidateRun(
          connectionRef,
          run.phase,
          enabledReadwiseReaderCategories(settings.readwiseAutoImportPolicy)
        );
      }
    }
  } catch (error) {
    if (!isExpiredCursorFailure(error, run.cursor)) throw error;
    restartReadwiseApiCandidateRun(connectionRef, settings.readwiseAutoImportPolicy);
    return ensureReadwiseApiCandidateIndex(settings, connectionRef, dependencies, purpose);
  }
  hideReadwiseApiExternalDocumentsExcept(
    connectionRef,
    new Set(loadReadwiseApiCandidates(connectionRef).map((item) => item.documentId))
  );
  return loadReadwiseApiCandidates(connectionRef);
}

export async function fetchReadwiseApiCandidateFacts(
  connectionRef: string,
  candidate: ReadwiseApiCandidate,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  return createReadwiseApiCandidateFactFetcher(connectionRef, dependencies)(candidate);
}

export function createReadwiseApiCandidateFactFetcher(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const request = createReadwiseApiRequest(dependencies);
  return async (candidate: ReadwiseApiCandidate) => {
    let parent = null;
    for (let attempt = 0; attempt < MISSING_PARENT_ATTEMPTS && !parent; attempt += 1) {
      parent = await fetchExact(candidate.documentId, true, request);
    }
    if (!parent || !isReaderParentCategory(parent.category)
      || parent.category !== candidate.readerCategory) {
      throw new Error('readwise_api_candidate_parent_missing');
    }
    const highlights = [];
    for (const highlightId of candidate.highlightIds) {
      const highlight = await fetchExact(highlightId, false, request);
      if (!highlight || highlight.category !== 'highlight' || highlight.parentId !== candidate.documentId) {
        throw new Error('readwise_api_candidate_highlight_mismatch');
      }
      highlights.push(highlight);
    }
    saveReadwiseApiCandidateFacts(connectionRef, candidate.documentId, [parent, ...highlights]);
    return 'ready' as const;
  };
}

function exportCandidate(
  book: NonNullable<ReturnType<typeof normalizeExportBook>>,
  parent: NonNullable<ReturnType<typeof normalizeReaderDocument>>,
  settings: ImportManagerSettings
): ReadwiseApiCandidate[] {
  const highlightIds = book.highlights.filter((item) => !item.isDeleted).map((item) => item.externalId);
  if (book.source !== 'reader' || book.isDeleted || !book.externalId || highlightIds.length === 0) return [];
  const destination = resolveReadwiseAutoImportDestination(
    settings.readwiseAutoImportPolicy,
    parent.category as ReaderParentCategory,
    true
  );
  if (destination === 'off') return [];
  return [{
    destination,
    documentId: book.externalId,
    exportCategory: book.category,
    hasHighlights: true,
    highlightIds,
    matchedImportTag: false,
    readerCategory: parent.category as ReaderParentCategory,
    status: 'pending',
    title: null
  }];
}

function readerCandidate(
  document: NonNullable<ReturnType<typeof normalizeReaderDocument>>,
  settings: ImportManagerSettings
): ReadwiseApiCandidate[] {
  const matchedImportTag = matchesReadwiseDocumentImportTag(
    document.tags,
    settings.readwiseAutoImportPolicy.importTag
  );
  const destination = resolveReadwiseAutoImportDestination(
    settings.readwiseAutoImportPolicy,
    document.category as ReaderParentCategory,
    false,
    matchedImportTag
  );
  if (destination === 'off') return [];
  return [{
    destination,
    documentId: document.id,
    exportCategory: null,
    hasHighlights: false,
    highlightIds: [],
    matchedImportTag,
    readerCategory: document.category as ReaderParentCategory,
    status: 'pending',
    title: document.title
  }];
}

async function fetchExact(
  id: string,
  withHtmlContent: boolean,
  request: ReturnType<typeof createReadwiseApiRequest>
) {
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', id);
  if (withHtmlContent) url.searchParams.set('withHtmlContent', 'true');
  const payload = await request(url);
  return values(payload).map(normalizeReaderDocument).find((item) => item?.id === id) ?? null;
}

function buildIndexUrl(phase: string, cursor: string | null, updatedAfter: string | null) {
  const url = new URL(phase === 'export' ? READWISE_EXPORT_URL : READWISE_READER_LIST_URL);
  if (updatedAfter) url.searchParams.set('updatedAfter', updatedAfter);
  if (cursor) url.searchParams.set('pageCursor', cursor);
  if (phase === 'export') url.searchParams.set('includeDeleted', 'true');
  else {
    url.searchParams.set('category', phase.slice('reader:'.length));
    url.searchParams.set('limit', '100');
  }
  return url;
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}

function nextCursor(payload: Record<string, unknown>) {
  return typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
    ? payload.nextPageCursor : null;
}

function isExpiredCursorFailure(error: unknown, cursor: string | null) {
  return Boolean(cursor) && error instanceof Error && error.message === 'readwise_api_http_400';
}

function isReaderParentCategory(value: unknown): value is ReaderParentCategory {
  return READER_PARENT_CATEGORIES.includes(value as ReaderParentCategory);
}
