import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { normalizeExportBook, normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { bindReadwiseApiAnnotationParents } from '../database/readwiseApiAnnotationLedger.js';
import { loadOrCreateReadwiseApiCandidateRun, saveReadwiseApiCandidateCursor } from '../database/readwiseApiCandidateRun.js';
import { saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import {
  countReadwiseApiIndexedRecords,
  loadReadwiseApiAnnotationLedger,
  loadReadwiseApiExportIndex,
  loadReadwiseApiReaderIndex,
  saveReadwiseApiAnnotationContentStates,
  saveReadwiseApiExportIndexPage,
  saveReadwiseApiReaderIndexPage
} from '../database/readwiseApiIndexStage.js';
import {
  loadOrCreateReadwiseApiScopeLedgers,
  saveReadwiseApiScopeCursor
} from '../database/readwiseApiScopeLedger.js';

import { indexReadwiseApiAnnotationGraph } from './readwiseApiAnnotationGraph.js';
import { resolveReadwiseApiNoteParents } from './readwiseApiAnnotationParentResolution.js';
import { resolveReadwiseApiCandidateParent } from './readwiseApiCandidateParent.js';
import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import {
  READER_PARENT_CATEGORIES,
  type ReadwiseApiCandidate,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import {
  createReadwiseApiRequest,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { buildReadwiseApiScopeUrl } from './readwiseApiIndexPlan.js';

export async function buildReadwiseApiCandidateIndex(input: {
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  onProgress?: (processed: number) => void;
  settings: ImportManagerSettings;
}) {
  const run = loadOrCreateReadwiseApiCandidateRun(
    input.connectionRef,
    input.settings.readwiseAutoImportPolicy
  );
  const request = createReadwiseApiRequest(input.dependencies);
  const ledgers = loadOrCreateReadwiseApiScopeLedgers(
    input.connectionRef,
    input.settings.readwiseAutoImportPolicy,
    run.roundStartedAt
  );
  for (const initial of ledgers) await fetchScope(input, initial, request);
  await assembleCandidates(input.connectionRef, input.settings, request, input.onProgress);
  saveReadwiseApiCandidateCursor({ connectionRef: input.connectionRef, cursor: null, phase: 'ready' });
}

async function fetchScope(
  input: Parameters<typeof buildReadwiseApiCandidateIndex>[0],
  initial: ReturnType<typeof loadOrCreateReadwiseApiScopeLedgers>[number],
  request: ReturnType<typeof createReadwiseApiRequest>
) {
  let ledger = initial;
  if (ledger.status === 'complete') return;
  while (true) {
    const url = buildReadwiseApiScopeUrl({
      checkpoint: ledger.checkpoint,
      cursor: ledger.cursor,
      importTag: input.settings.readwiseAutoImportPolicy.importTag,
      scope: ledger.scope
    });
    let payload: Record<string, unknown>;
    try {
      payload = await request(url);
    } catch (error) {
      if (ledger.cursor && error instanceof Error && error.message === 'readwise_api_http_400') {
        throw new Error(`readwise_api_scope_cursor_invalid:${ledger.scope}`);
      }
      throw error;
    }
    savePage(
      input.connectionRef,
      ledger.scope,
      payload,
      ledger.runStartedAt,
      input.settings.readwiseAutoImportPolicy.importTag
    );
    input.dependencies.onPage?.({
      phase: ledger.scope === 'export' ? 'export' : 'reader',
      recordCount: values(payload).length
    });
    reportIndexProgress(input.connectionRef, input.onProgress);
    const cursor = nextCursor(payload);
    ledger = saveReadwiseApiScopeCursor(input.connectionRef, ledger, cursor);
    if (!cursor) return;
  }
}

function savePage(
  connectionRef: string,
  scope: string,
  payload: Record<string, unknown>,
  seenInRun: string,
  importTag: string
) {
  if (scope === 'export') {
    saveReadwiseApiExportIndexPage(connectionRef,
      values(payload).map(normalizeExportBook).filter((item) => item !== null));
  } else {
    saveReadwiseApiReaderIndexPage(connectionRef,
      values(payload).map(normalizeReaderDocument).filter((item) => item !== null),
      seenInRun,
      scope === 'reader:tag' ? importTag.trim() : null);
  }
}

async function assembleCandidates(
  connectionRef: string, settings: ImportManagerSettings,
  request: ReturnType<typeof createReadwiseApiRequest>, onProgress?: (processed: number) => void
) {
  const run = loadOrCreateReadwiseApiCandidateRun(connectionRef, settings.readwiseAutoImportPolicy);
  await resolveReadwiseApiNoteParents({
    connectionRef, facts: loadReadwiseApiAnnotationLedger(connectionRef),
    onProgress: () => reportIndexProgress(connectionRef, onProgress),
    request,
    runStartedAt: run.roundStartedAt
  });
  const documents = loadReadwiseApiReaderIndex(connectionRef);
  const byId = new Map(documents.map((item) => [item.id, item]));
  const annotations = loadReadwiseApiAnnotationLedger(connectionRef);
  const graph = indexReadwiseApiAnnotationGraph(annotations, run.roundStartedAt);
  const exportBooks = loadReadwiseApiExportIndex(connectionRef);
  saveReadwiseApiAnnotationContentStates(connectionRef, new Set(exportBooks.flatMap((book) =>
    book.highlights.filter((item) => !item.isDeleted && Boolean(item.text || item.note))
      .map((item) => item.externalId)
  )), run.roundStartedAt);
  const exportIdsByParent = indexExportMatches(annotations, exportBooks);
  const parentIds = new Set([
    ...documents.filter((item) => isParentCategory(item.category)).map((item) => item.id),
    ...graph.affectedParents,
    ...exportIdsByParent.keys()
  ]);
  for (const parentId of parentIds) {
    let parent = byId.get(parentId) ?? null;
    const knownHighlightIds = new Set(graph.highlightIdsByParent.get(parentId) ?? []);
    const highlightIds = [...new Set([
      ...(graph.currentHighlightIdsByParent.get(parentId) ?? []),
      ...(exportIdsByParent.get(parentId) ?? []).filter((id) => knownHighlightIds.has(id))
    ])];
    const hasHighlights = graph.highlightedParents.has(parentId);
    if (!parent && (hasHighlights || exportIdsByParent.has(parentId))) {
      parent = await resolveReadwiseApiCandidateParent(connectionRef, parentId, settings, request, run.roundStartedAt);
      if (!parent) continue;
      saveReadwiseApiReaderIndexPage(connectionRef, [parent]);
      reportIndexProgress(connectionRef, onProgress);
      byId.set(parent.id, parent);
    }
    if (!parent || !isParentCategory(parent.category)) continue;
    const matchedImportTag = matchesReadwiseDocumentImportTag(
      parent.matchedImportTag ? { [parent.matchedImportTag]: true } : null,
      settings.readwiseAutoImportPolicy.importTag
    );
    const destination = resolveReadwiseAutoImportDestination(
      settings.readwiseAutoImportPolicy,
      parent.category,
      hasHighlights,
      matchedImportTag
    );
    if (destination === 'off') continue;
    const noteIds = graph.noteIdsByParent.get(parentId) ?? [];
    bindReadwiseApiAnnotationParents(connectionRef, parentId, [...highlightIds, ...noteIds]);
    saveReadwiseApiCandidates(connectionRef, [candidate(
      parent, destination, hasHighlights, highlightIds, noteIds, matchedImportTag
    )]);
  }
}

function reportIndexProgress(connectionRef: string, onProgress?: (processed: number) => void) {
  if (onProgress) onProgress(countReadwiseApiIndexedRecords(connectionRef));
}

function indexExportMatches(
  annotations: ReturnType<typeof loadReadwiseApiAnnotationLedger>,
  exportBooks: ReturnType<typeof loadReadwiseApiExportIndex>
) {
  const highlightParentById = new Map(annotations.filter((item) =>
    item.category === 'highlight' && item.resolution !== 'article-parent-unavailable')
    .map((item) => [item.remoteId, item.parentId]));
  return new Map(exportBooks.flatMap((book) => {
    const matched = book.highlightExternalIds.filter((id) => highlightParentById.has(id));
    if (book.externalId && matched.some((id) => highlightParentById.get(id) !== book.externalId)) {
      throw new Error('readwise_api_annotation_identity_conflict');
    }
    return book.externalId && matched.length ? [[book.externalId, matched] as const] : [];
  }));
}

function candidate(
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

function isParentCategory(value: unknown): value is ReaderParentCategory {
  return READER_PARENT_CATEGORIES.includes(value as ReaderParentCategory);
}

function values(payload: Record<string, unknown>) {
  return Array.isArray(payload.results) ? payload.results : [];
}

function nextCursor(payload: Record<string, unknown>) {
  return typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
    ? payload.nextPageCursor : null;
}
