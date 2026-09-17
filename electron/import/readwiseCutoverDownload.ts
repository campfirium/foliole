import { normalizeExportBook, normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateReadwiseApiImportRun, loadStagedReadwiseApiContracts, saveReadwiseApiStagePage } from '../database/readwiseApiImportState.js';
import { loadReadwiseCutoverStage, saveReadwiseCutoverStage } from '../database/readwiseCutoverStage.js';

import { assertReadwiseApiEligible, type ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';

type Kind = 'reader' | 'export';
interface PageState { cursor: string | null; done: boolean; saved: number; started: boolean; total: number | null }
interface DownloadState { reader: PageState; export: PageState; countIssue: string | null; startedAt: string; version?: number }
const KIND = 'cutover-download-v1';
const DOWNLOAD_STATE_VERSION = 2;

export function readCutoverDownloadProgress(connectionRef: string) {
  const state = loadReadwiseCutoverStage<DownloadState>(connectionRef, KIND);
  if (!state) return { completed: 0, total: null };
  const known = [state.reader, state.export].filter((item) => item.total !== null);
  const completed = known.length
    ? known.reduce((sum, item) => sum + item.saved, 0)
    : state.reader.saved + state.export.saved;
  const total = state.countIssue || known.length === 0
    ? null : known.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const complete = state.reader.done && state.export.done;
  return { completed, total: total !== null && (completed > total || (!complete && completed === total)) ? null : total };
}

export async function downloadReadwiseCutover(
  connectionRef: string,
  request: (url: URL) => Promise<Record<string, unknown>>,
  dependencies: ReadwiseApiFetchDependencies
) {
  let state = loadDownload(connectionRef);
  while (!state.reader.done || !state.export.done) {
    const kind = nextKind(state);
    dependencies.assertCutoverBatch?.();
    assertReadwiseApiEligible(dependencies.signal, connectionRef, dependencies.allowFolderModeForCutover);
    const payload = await request(pageUrl(kind, state[kind].cursor));
    assertReadwiseApiEligible(dependencies.signal, connectionRef, dependencies.allowFolderModeForCutover);
    dependencies.assertCutoverBatch?.();
    state = persistPage(connectionRef, kind, state, payload);
    dependencies.onPage?.({ phase: kind, recordCount: (payload.results as unknown[]).length,
      ...(state[kind].total === null ? {} : { totalCount: state[kind].total }) });
  }
  return loadOrCreateReadwiseApiImportRun(connectionRef);
}

function loadDownload(connectionRef: string): DownloadState {
  const saved = loadReadwiseCutoverStage<DownloadState>(connectionRef, KIND);
  if (saved) return upgradeDownloadState(connectionRef, saved);
  const run = loadOrCreateReadwiseApiImportRun(connectionRef, new Date().toISOString(), true);
  const facts = loadStagedReadwiseApiContracts(connectionRef);
  const side = (cursor: string | null, done: boolean, count: number): PageState => ({
    cursor, done, saved: count, started: done || Boolean(cursor) || count > 0, total: null
  });
  const state = {
    reader: side(run.readerCursor, run.phase !== 'reader', facts.readerDocuments.length),
    export: side(run.exportCursor, run.phase === 'ready', exportHighlightCount(facts.exportBooks)),
    countIssue: null, startedAt: run.roundStartedAt, version: DOWNLOAD_STATE_VERSION
  };
  saveReadwiseCutoverStage(connectionRef, KIND, state);
  return state;
}

function nextKind(state: DownloadState): Kind {
  if (!state.reader.started) return 'reader';
  if (!state.export.started) return 'export';
  return state.reader.done ? 'export' : 'reader';
}

function persistPage(connectionRef: string, kind: Kind, state: DownloadState, payload: Record<string, unknown>) {
  if (!Array.isArray(payload.results)) throw new Error('readwise_source_cutover_page_invalid');
  const items = kind === 'reader' ? payload.results.map(normalizeReaderDocument) : payload.results.map(normalizeExportBook);
  if (items.some((item) => item === null)) throw new Error('readwise_source_cutover_page_invalid');
  const cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor ? payload.nextPageCursor : null;
  const total = typeof payload.count === 'number' && Number.isSafeInteger(payload.count) && payload.count >= 0
    ? payload.count : null;
  const previous = state[kind];
  const changed = previous.started && previous.total !== null && previous.total !== total;
  const next: DownloadState = { ...state, countIssue: state.countIssue ?? (changed ? 'remote_total_changed' : null),
    [kind]: { cursor, done: !cursor, saved: previous.saved + savedItemCount(kind, items), started: true, total },
    version: DOWNLOAD_STATE_VERSION };
  if (!cursor && total !== null && next[kind].saved !== total) next.countIssue = 'remote_count_mismatch';
  openDatabaseConnection().driver.transaction((driver) => {
    saveReadwiseApiStagePage({ connectionRef, cursor, items: items.filter((item) => item !== null), kind });
    saveReadwiseCutoverStage(connectionRef, KIND, next);
    driver.execute('UPDATE readwise_api_import_runs SET phase = ? WHERE connection_ref = ?',
      [next.reader.done && next.export.done ? 'ready' : nextKind(next), connectionRef]);
  });
  return next;
}

function upgradeDownloadState(connectionRef: string, state: DownloadState) {
  if (state.version === DOWNLOAD_STATE_VERSION) return state;
  const facts = loadStagedReadwiseApiContracts(connectionRef);
  const next: DownloadState = {
    ...state,
    export: { ...state.export, saved: exportHighlightCount(facts.exportBooks) },
    version: DOWNLOAD_STATE_VERSION
  };
  if (state.countIssue === 'remote_count_mismatch' && !hasTerminalCountMismatch(next)) {
    next.countIssue = null;
  }
  saveReadwiseCutoverStage(connectionRef, KIND, next);
  return next;
}

function hasTerminalCountMismatch(state: DownloadState) {
  return (state.reader.done && state.reader.total !== null && state.reader.saved !== state.reader.total)
    || (state.export.done && state.export.total !== null && state.export.saved !== state.export.total);
}

function savedItemCount(kind: Kind, items: Array<ReturnType<typeof normalizeReaderDocument> | ReturnType<typeof normalizeExportBook>>) {
  if (kind === 'reader') return items.length;
  return items.reduce((total, item) => total + (item && 'highlights' in item ? item.highlights.length : 0), 0);
}

function exportHighlightCount(books: Array<{ highlights: unknown[] }>) {
  return books.reduce((total, book) => total + book.highlights.length, 0);
}

function pageUrl(kind: Kind, cursor: string | null) {
  const url = new URL(kind === 'reader' ? 'https://readwise.io/api/v3/list/' : 'https://readwise.io/api/v2/export/');
  if (cursor) url.searchParams.set('pageCursor', cursor);
  if (kind === 'reader') {
    url.searchParams.set('limit', '100');
    url.searchParams.set('withHtmlContent', 'true');
    url.searchParams.set('withRawSourceUrl', 'true');
  } else url.searchParams.set('includeDeleted', 'true');
  return url;
}
