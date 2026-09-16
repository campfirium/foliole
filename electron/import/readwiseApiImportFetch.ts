import {
  normalizeExportBook,
  normalizeReaderDocument
} from '../../lib/core/readwise/readwiseApiContract.js';
import {
  loadOrCreateReadwiseApiImportRun,
  loadStagedReadwiseApiContracts,
  resetReadwiseApiImportRun,
  saveReadwiseApiStagePage,
  type ReadwiseApiImportRunState
} from '../database/readwiseApiImportState.js';
import { loadReadwiseRemoteSource } from '../database/readwiseRemoteIdentity.js';

import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import {
  assertReadwiseApiEligible,
  canRunReadwiseApiRequest,
  createReadwiseRequest,
  type ReadwiseApiFetchDependencies
} from './readwiseApiRequest.js';
import { readReadwiseApiSecret } from './readwiseApiSecret.js';
import { downloadReadwiseCutover } from './readwiseCutoverDownload.js';

export type { ReadwiseApiFetchDependencies } from './readwiseApiRequest.js';

export const READWISE_READER_LIST_URL = 'https://readwise.io/api/v3/list/';
export const READWISE_EXPORT_URL = 'https://readwise.io/api/v2/export/';

export async function fetchReadwiseRawSourceDocument(
  documentId: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canRunReadwiseApiRequest(dependencies) || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  const request = createReadwiseRequest(
    readReadwiseApiSecret(settings.apiConnection.secretRef), dependencies,
    loadReadwiseRemoteSource()?.connectionRef
  );
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', documentId);
  url.searchParams.set('withRawSourceUrl', 'true');
  const payload = await request(url);
  const document = (Array.isArray(payload.results) ? payload.results : [])
    .map(normalizeReaderDocument).find((item) => item?.id === documentId) ?? null;
  return document;
}

export async function fetchReadwiseApiImportRound(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canRunReadwiseApiRequest(dependencies) || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  const token = readReadwiseApiSecret(settings.apiConnection.secretRef);
  const request = createReadwiseRequest(token, dependencies, connectionRef);
  let run = loadOrCreateReadwiseApiImportRun(connectionRef);
  try {
    run = await fetchRemainingPages(run, request, dependencies);
  } catch (error) {
    const persistedRun = loadOrCreateReadwiseApiImportRun(connectionRef);
    if (!isExpiredCursorFailure(error, persistedRun)) throw error;
    resetReadwiseApiImportRun(connectionRef);
    run = await fetchRemainingPages(loadOrCreateReadwiseApiImportRun(connectionRef), request, dependencies);
  }
  return run;
}

export async function fetchReadwiseSourceCutoverSnapshot(
  connectionRef: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canRunReadwiseApiRequest(dependencies) || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  const request = createReadwiseRequest(
    readReadwiseApiSecret(settings.apiConnection.secretRef), dependencies, connectionRef
  );
  return downloadReadwiseCutover(connectionRef, request, dependencies);
}

async function fetchRemainingPages(
  initial: ReadwiseApiImportRunState,
  request: (url: URL) => Promise<Record<string, unknown>>,
  dependencies: ReadwiseApiFetchDependencies,
  hydrateAncestors = true
) {
  let run = initial;
  while (run.phase !== 'ready') {
    assertReadwiseApiEligible(dependencies.signal, run.connectionRef, dependencies.allowFolderModeForCutover);
    const kind = run.phase;
    const url = buildPageUrl(run, kind);
    const payload = await request(url);
    assertReadwiseApiEligible(dependencies.signal, run.connectionRef, dependencies.allowFolderModeForCutover);
    const values = Array.isArray(payload.results) ? payload.results : [];
    const items = kind === 'reader'
      ? values.map(normalizeReaderDocument).filter((item) => item !== null)
      : values.map(normalizeExportBook).filter((item) => item !== null);
    const cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
      ? payload.nextPageCursor : null;
    saveReadwiseApiStagePage({ connectionRef: run.connectionRef, cursor, items, kind });
    dependencies.onPage?.({
      phase: kind,
      recordCount: items.length,
      ...(typeof payload.count === 'number' ? { totalCount: payload.count } : {})
    });
    run = loadOrCreateReadwiseApiImportRun(run.connectionRef);
    if (hydrateAncestors && kind === 'reader' && !cursor) {
      await hydrateMissingReaderAncestors(run.connectionRef, request, dependencies);
      run = loadOrCreateReadwiseApiImportRun(run.connectionRef);
    }
  }
  return run;
}

async function hydrateMissingReaderAncestors(
  connectionRef: string,
  request: (url: URL) => Promise<Record<string, unknown>>,
  dependencies: ReadwiseApiFetchDependencies
) {
  const attempted = new Set<string>();
  while (true) {
    const staged = loadStagedReadwiseApiContracts(connectionRef).readerDocuments;
    const known = new Set(staged.map((document) => document.id));
    const missing = staged
      .filter((document) => document.category === 'highlight' || document.category === 'note')
      .map((document) => document.parentId)
      .find((id): id is string => Boolean(id && !known.has(id) && !attempted.has(id)));
    if (!missing) return;
    attempted.add(missing);
    assertReadwiseApiEligible(dependencies.signal, connectionRef, dependencies.allowFolderModeForCutover);
    const url = new URL(READWISE_READER_LIST_URL);
    url.searchParams.set('id', missing);
    url.searchParams.set('withHtmlContent', 'true');
    const payload = await request(url);
    assertReadwiseApiEligible(dependencies.signal, connectionRef, dependencies.allowFolderModeForCutover);
    const items = (Array.isArray(payload.results) ? payload.results : [])
      .map(normalizeReaderDocument).filter((item) => item !== null);
    saveReadwiseApiStagePage({ connectionRef, cursor: null, items, kind: 'reader' });
    dependencies.onPage?.({ phase: 'reader', recordCount: items.length });
  }
}

function buildPageUrl(run: ReadwiseApiImportRunState, kind: 'export' | 'reader') {
  const url = new URL(kind === 'reader' ? READWISE_READER_LIST_URL : READWISE_EXPORT_URL);
  if (run.queryUpdatedAfter) url.searchParams.set('updatedAfter', run.queryUpdatedAfter);
  if (kind === 'reader') {
    url.searchParams.set('limit', '100');
    url.searchParams.set('withHtmlContent', 'true');
    url.searchParams.set('withRawSourceUrl', 'true');
    if (run.readerCursor) url.searchParams.set('pageCursor', run.readerCursor);
  } else {
    url.searchParams.set('includeDeleted', 'true');
    if (run.exportCursor) url.searchParams.set('pageCursor', run.exportCursor);
  }
  return url;
}

export function createReadwiseApiRequest(dependencies: ReadwiseApiFetchDependencies = {}) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canRunReadwiseApiRequest(dependencies) || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  return createReadwiseRequest(
    readReadwiseApiSecret(settings.apiConnection.secretRef), dependencies,
    loadReadwiseRemoteSource()?.connectionRef
  );
}

function isExpiredCursorFailure(error: unknown, run: ReadwiseApiImportRunState) {
  return (Boolean(run.readerCursor) || Boolean(run.exportCursor)) &&
    error instanceof Error && error.message === 'readwise_api_http_400';
}
