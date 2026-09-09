import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
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

import type { ReadwiseApiCandidate, ReaderParentCategory } from './readwiseApiCandidateTypes.js';
import {
  createReadwiseApiRequest,
  READWISE_EXPORT_URL,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';

const MISSING_PARENT_ATTEMPTS = 3;

export async function ensureReadwiseApiCandidateIndex(
  settings: ImportManagerSettings,
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  let run = loadOrCreateReadwiseApiCandidateRun(connectionRef, settings.readwiseReaderConfig);
  const request = createReadwiseApiRequest(dependencies);
  try {
    while (run.phase !== 'ready') {
      const url = buildIndexUrl(run.phase, run.cursor, run.queryUpdatedAfter);
      const payload = await request(url);
      const cursor = nextCursor(payload);
      if (run.phase === 'export') {
        const books = values(payload).map(normalizeExportBook).filter((item) => item !== null);
        saveReadwiseApiCandidateExportPage(connectionRef, books);
        saveReadwiseApiCandidates(connectionRef, books.flatMap((book) => exportCandidate(book, settings)));
      } else {
        const category = run.phase.slice('reader:'.length) as ReaderParentCategory;
        const documents = values(payload).map(normalizeReaderDocument).filter((item) => item !== null);
        saveReadwiseApiCandidates(connectionRef, documents.flatMap((document) =>
          document.category === category ? [readerCandidate(document, settings)] : []
        ));
      }
      dependencies.onPage?.({ phase: run.phase === 'export' ? 'export' : 'reader', recordCount: values(payload).length });
      if (cursor) {
        saveReadwiseApiCandidateCursor({ connectionRef, cursor, phase: run.phase });
        run = { ...run, cursor };
      } else {
        if (run.phase === 'export' && settings.readwiseReaderConfig.withoutHighlightsDestination === 'off') {
          hideReadwiseApiExternalDocumentsExcept(
            connectionRef,
            new Set(loadReadwiseApiCandidates(connectionRef).filter((item) => item.hasHighlights)
              .map((item) => item.documentId))
          );
        }
        run = advanceReadwiseApiCandidateRun(
          connectionRef,
          run.phase,
          settings.readwiseReaderConfig.withoutHighlightsDestination !== 'off'
        );
      }
    }
  } catch (error) {
    if (!isExpiredCursorFailure(error, run.cursor)) throw error;
    restartReadwiseApiCandidateRun(connectionRef, settings.readwiseReaderConfig);
    return ensureReadwiseApiCandidateIndex(settings, connectionRef, dependencies);
  }
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
    if (!parent || parent.category === 'highlight' || parent.category === 'note') {
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
  settings: ImportManagerSettings
): ReadwiseApiCandidate[] {
  const highlightIds = book.highlights.filter((item) => !item.isDeleted).map((item) => item.externalId);
  if (book.source !== 'reader' || book.isDeleted || !book.externalId || highlightIds.length === 0) return [];
  return [{
    destination: settings.readwiseReaderConfig.withHighlightsDestination,
    documentId: book.externalId,
    exportCategory: book.category,
    hasHighlights: true,
    highlightIds,
    readerCategory: null,
    status: 'pending',
    title: null
  }];
}

function readerCandidate(
  document: NonNullable<ReturnType<typeof normalizeReaderDocument>>,
  settings: ImportManagerSettings
): ReadwiseApiCandidate {
  return {
    destination: settings.readwiseReaderConfig.withoutHighlightsDestination === 'off'
      ? 'inbox' : settings.readwiseReaderConfig.withoutHighlightsDestination,
    documentId: document.id,
    exportCategory: null,
    hasHighlights: false,
    highlightIds: [],
    readerCategory: document.category as ReaderParentCategory,
    status: 'pending',
    title: document.title
  };
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
