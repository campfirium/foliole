import type { ImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';
import { resolveReadwiseAutoImportDestination } from '../../lib/core/import/readwiseAutoImportPolicy.js';
import { normalizeExportBook, normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { bindReadwiseApiAnnotationParents } from '../database/readwiseApiAnnotationLedger.js';
import { loadOrCreateReadwiseApiCandidateRun, saveReadwiseApiCandidateCursor } from '../database/readwiseApiCandidateRun.js';
import { saveReadwiseApiCandidates } from '../database/readwiseApiCandidateStage.js';
import {
  countReadwiseApiIndexedRecords,
  loadReadwiseApiAnnotationLedger,
  loadReadwiseApiExportIndex,
  loadReadwiseApiReaderIndex,
  saveReadwiseApiExportIndexPage,
  saveReadwiseApiReaderIndexPage
} from '../database/readwiseApiIndexStage.js';
import {
  loadOrCreateReadwiseApiScopeLedgers,
  saveReadwiseApiScopeCursor
} from '../database/readwiseApiScopeLedger.js';

import { indexReadwiseApiAnnotationGraph } from './readwiseApiAnnotationGraph.js';
import { resolveReadwiseApiNoteParents } from './readwiseApiAnnotationParentResolution.js';
import { resolveAndSaveReadwiseApiCandidateParent } from './readwiseApiCandidateParent.js';
import { createReadwiseApiCandidateRecord } from './readwiseApiCandidateRecord.js';
import { matchesReadwiseDocumentImportTag } from './readwiseApiCandidateRouting.js';
import {
  READER_PARENT_CATEGORIES,
  type ReaderParentCategory
} from './readwiseApiCandidateTypes.js';
import {
  createReadwiseApiRequest,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import {
  indexReadwiseApiExportAnnotationContent,
  indexReadwiseApiExportMatches
} from './readwiseApiIndexExportFacts.js';
import { buildReadwiseApiScopeUrl } from './readwiseApiIndexPlan.js';

export async function buildReadwiseApiCandidateIndex(input: {
  connectionRef: string;
  dependencies: ReadwiseApiFetchDependencies;
  includeParentContent?: boolean;
  onProgress?: (processed: number) => void;
  settings: ImportManagerSettings;
}) {
  const request = createReadwiseApiRequest(input.dependencies);
  const ledgers = await runWithDatabaseConnectionOwner(() => {
    const run = loadOrCreateReadwiseApiCandidateRun(
      input.connectionRef, input.settings.readwiseAutoImportPolicy
    );
    return loadOrCreateReadwiseApiScopeLedgers(
      input.connectionRef, input.settings.readwiseAutoImportPolicy, run.roundStartedAt
    );
  });
  for (const initial of ledgers) await fetchScope(input, initial, request);
  await assembleCandidates(
    input.connectionRef, input.settings, request, input.includeParentContent !== false, input.onProgress
  );
  await runWithDatabaseConnectionOwner(() => {
    saveReadwiseApiCandidateCursor({ connectionRef: input.connectionRef, cursor: null, phase: 'ready' });
  });
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
      ...(input.includeParentContent === undefined
        ? {} : { includeParentContent: input.includeParentContent }),
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
    const cursor = nextCursor(payload);
    ledger = await runWithDatabaseConnectionOwner(() => {
      savePage(input.connectionRef, ledger.scope, payload, ledger.runStartedAt);
      input.dependencies.onPage?.({
        phase: ledger.scope === 'export' ? 'export' : 'reader',
        recordCount: values(payload).length
      });
      reportIndexProgress(input.connectionRef, input.onProgress);
      return saveReadwiseApiScopeCursor(input.connectionRef, ledger, cursor);
    });
    if (!cursor) return;
  }
}

function savePage(
  connectionRef: string,
  scope: string,
  payload: Record<string, unknown>,
  seenInRun: string
) {
  if (scope === 'export') {
    saveReadwiseApiExportIndexPage(connectionRef,
      values(payload).map(normalizeExportBook).filter((item) => item !== null));
  } else {
    saveReadwiseApiReaderIndexPage(connectionRef,
      values(payload).map(normalizeReaderDocument).filter((item) => item !== null),
      seenInRun);
  }
}

async function assembleCandidates(
  connectionRef: string, settings: ImportManagerSettings,
  request: ReturnType<typeof createReadwiseApiRequest>, includeParentContent: boolean,
  onProgress: ((processed: number) => void) | undefined
) {
  const { run, facts } = await runWithDatabaseConnectionOwner(() => ({
    run: loadOrCreateReadwiseApiCandidateRun(connectionRef, settings.readwiseAutoImportPolicy),
    facts: loadReadwiseApiAnnotationLedger(connectionRef)
  }));
  await resolveReadwiseApiNoteParents({
    connectionRef, facts,
    onProgress: () => reportIndexProgress(connectionRef, onProgress),
    request,
    runStartedAt: run.roundStartedAt
  });
  const { byId, exportIdsByParent, graph, parentIds } = await loadCandidateAssemblyFacts(
    connectionRef, run.roundStartedAt
  );
  for (const parentId of parentIds) {
    let parent = byId.get(parentId) ?? null;
    const knownHighlightIds = new Set(graph.highlightIdsByParent.get(parentId) ?? []);
    const highlightIds = [...new Set([
      ...(graph.currentHighlightIdsByParent.get(parentId) ?? []),
      ...(exportIdsByParent.get(parentId) ?? []).filter((id) => knownHighlightIds.has(id))
    ])];
    const hasHighlights = graph.highlightedParents.has(parentId);
    if (!parent && (hasHighlights || exportIdsByParent.has(parentId))) {
      parent = await resolveAndSaveReadwiseApiCandidateParent({ connectionRef, id: parentId, includeContent: includeParentContent,
        onResolved: () => reportIndexProgress(connectionRef, onProgress), request,
        runStartedAt: run.roundStartedAt, settings
      });
      if (!parent) continue;
      byId.set(parent.id, parent);
    }
    if (!parent || !isParentCategory(parent.category)) continue;
    const matchedImportTag = matchesReadwiseDocumentImportTag(
      parent.tags,
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
    await runWithDatabaseConnectionOwner(() => {
      bindReadwiseApiAnnotationParents(connectionRef, parentId, [...highlightIds, ...noteIds]);
      saveReadwiseApiCandidates(connectionRef, [createReadwiseApiCandidateRecord(
        parent, destination, hasHighlights, highlightIds, noteIds, matchedImportTag
      )]);
    });
  }
}

function loadCandidateAssemblyFacts(connectionRef: string, runStartedAt: string) {
  return runWithDatabaseConnectionOwner(() => {
    const documents = loadReadwiseApiReaderIndex(connectionRef);
    const byId = new Map(documents.map((item) => [item.id, item]));
    const annotations = loadReadwiseApiAnnotationLedger(connectionRef);
    const graph = indexReadwiseApiAnnotationGraph(annotations, runStartedAt);
    const exportBooks = loadReadwiseApiExportIndex(connectionRef);
    indexReadwiseApiExportAnnotationContent(connectionRef, exportBooks, runStartedAt);
    const exportIdsByParent = indexReadwiseApiExportMatches(annotations, exportBooks);
    const parentIds = new Set([
      ...documents.filter((item) => isParentCategory(item.category)).map((item) => item.id),
      ...graph.affectedParents,
      ...exportIdsByParent.keys()
    ]);
    return { byId, exportIdsByParent, graph, parentIds };
  });
}

function reportIndexProgress(connectionRef: string, onProgress?: (processed: number) => void) {
  if (onProgress) onProgress(countReadwiseApiIndexedRecords(connectionRef));
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
