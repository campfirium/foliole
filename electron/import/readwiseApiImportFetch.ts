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
import { canCurrentHostRunReadwise } from '../database/readwiseHostAssignment.js';

import { saveReconnectRequired } from './readwiseApiConnection.js';
import { loadStoredReadwiseHostSettings } from './readwiseApiConnectionState.js';
import { readReadwiseApiSecret } from './readwiseApiSecret.js';

export const READWISE_READER_LIST_URL = 'https://readwise.io/api/v3/list/';
export const READWISE_EXPORT_URL = 'https://readwise.io/api/v2/export/';

export interface ReadwiseApiFetchDependencies {
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  onPage?: (input: { phase: 'export' | 'reader'; recordCount: number }) => void;
  signal?: AbortSignal;
}

export async function fetchReadwiseRawSourceDocument(
  documentId: string,
  dependencies: ReadwiseApiFetchDependencies = {}
) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canCurrentHostRunReadwise('api') || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  const request = createRequest(readReadwiseApiSecret(settings.apiConnection.secretRef), dependencies);
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
  if (!canCurrentHostRunReadwise('api') || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  const token = readReadwiseApiSecret(settings.apiConnection.secretRef);
  const request = createRequest(token, dependencies);
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

async function fetchRemainingPages(
  initial: ReadwiseApiImportRunState,
  request: (url: URL) => Promise<Record<string, unknown>>,
  dependencies: ReadwiseApiFetchDependencies
) {
  let run = initial;
  while (run.phase !== 'ready') {
    assertEligible(dependencies.signal);
    const kind = run.phase;
    const url = buildPageUrl(run, kind);
    const payload = await request(url);
    const values = Array.isArray(payload.results) ? payload.results : [];
    const items = kind === 'reader'
      ? values.map(normalizeReaderDocument).filter((item) => item !== null)
      : values.map(normalizeExportBook).filter((item) => item !== null);
    const cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
      ? payload.nextPageCursor : null;
    saveReadwiseApiStagePage({ connectionRef: run.connectionRef, cursor, items, kind });
    dependencies.onPage?.({ phase: kind, recordCount: items.length });
    run = loadOrCreateReadwiseApiImportRun(run.connectionRef);
    if (kind === 'reader' && !cursor) {
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
    assertEligible(dependencies.signal);
    const url = new URL(READWISE_READER_LIST_URL);
    url.searchParams.set('id', missing);
    url.searchParams.set('withHtmlContent', 'true');
    const payload = await request(url);
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
    if (run.readerCursor) url.searchParams.set('pageCursor', run.readerCursor);
  } else {
    url.searchParams.set('includeDeleted', 'true');
    if (run.exportCursor) url.searchParams.set('pageCursor', run.exportCursor);
  }
  return url;
}

function createRequest(token: string, dependencies: ReadwiseApiFetchDependencies) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const minIntervalMs = dependencies.minIntervalMs ?? 3_100;
  let lastRequestAt = 0;
  return async (url: URL) => {
    const delay = Math.max(0, lastRequestAt + minIntervalMs - Date.now());
    if (delay) await abortableDelay(delay, dependencies.signal);
    assertEligible(dependencies.signal);
    lastRequestAt = Date.now();
    const requestSignal = dependencies.signal
      ? AbortSignal.any([AbortSignal.timeout(30_000), dependencies.signal])
      : AbortSignal.timeout(30_000);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Token ${token}` },
      method: 'GET',
      redirect: 'error',
      signal: requestSignal
    });
    if (response.status === 401 || response.status === 403) {
      saveReconnectRequired(loadStoredReadwiseHostSettings());
      throw new Error('readwise_api_reconnect_required');
    }
    if (response.status === 429) {
      throw new Error(`readwise_api_rate_limited:${response.headers.get('retry-after') ?? ''}`);
    }
    if (!response.ok) throw new Error(`readwise_api_http_${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  };
}

export function createReadwiseApiRequest(dependencies: ReadwiseApiFetchDependencies = {}) {
  const settings = loadStoredReadwiseHostSettings();
  if (!canCurrentHostRunReadwise('api') || settings.apiConnection.state !== 'connected') {
    throw new Error('readwise_api_import_not_ready');
  }
  if (!settings.apiConnection.secretRef) throw new Error('readwise_api_token_missing');
  return createRequest(readReadwiseApiSecret(settings.apiConnection.secretRef), dependencies);
}

function assertEligible(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Readwise import cancelled', 'AbortError');
  if (!canCurrentHostRunReadwise('api')) throw new Error('readwise_execution_eligibility_lost');
}

function abortableDelay(delay: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Readwise import cancelled', 'AbortError'));
    }, { once: true });
  });
}

function isExpiredCursorFailure(error: unknown, run: ReadwiseApiImportRunState) {
  return (Boolean(run.readerCursor) || Boolean(run.exportCursor)) &&
    error instanceof Error && error.message === 'readwise_api_http_400';
}
