import { createHash } from 'node:crypto';

import {
  normalizeExportBook,
  normalizeReaderDocument,
  stableShape,
  summarizeReaderBody,
  type ExportBookContract,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';

const READER_LIST_URL = 'https://readwise.io/api/v3/list/';
const EXPORT_URL = 'https://readwise.io/api/v2/export/';
const MIN_REQUEST_INTERVAL_MS = 3_100;

export interface ReadwiseFetchedContract {
  exportBooks: ExportBookContract[];
  exportShape: unknown;
  readerDocuments: ReaderDocumentContract[];
  readerShape: unknown;
  requestCount: number;
}

export async function fetchReadwiseContract(
  token: string,
  options: { fetchImpl?: typeof fetch; minIntervalMs?: number } = {}
): Promise<ReadwiseFetchedContract> {
  const request = rateLimitedRequest(token, options.fetchImpl ?? fetch, options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS);
  const reader = await fetchPages(request, READER_LIST_URL, {
    limit: '100', withHtmlContent: 'true', withRawSourceUrl: 'true'
  });
  const exported = await fetchPages(request, EXPORT_URL, { includeDeleted: 'true' });
  return {
    exportBooks: exported.results.map(normalizeExportBook).filter((item) => item !== null),
    exportShape: exported.shape,
    readerDocuments: reader.results.map(normalizeReaderDocument).filter((item) => item !== null),
    readerShape: reader.shape,
    requestCount: reader.requestCount + exported.requestCount
  };
}

export function summarizeFetchedContract(contract: ReadwiseFetchedContract) {
  const categoryCounts: Record<string, number> = {};
  const bodyByCategory: Record<string, { readable: number; total: number; warnings: Record<string, number> }> = {};
  for (const document of contract.readerDocuments) {
    const category = document.category ?? 'unknown';
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    if (document.category === 'highlight' || document.category === 'note') continue;
    const body = summarizeReaderBody(document);
    const summary = bodyByCategory[category] ?? { readable: 0, total: 0, warnings: {} };
    summary.total += 1;
    if (body.readable) summary.readable += 1;
    for (const warning of body.warnings) summary.warnings[warning] = (summary.warnings[warning] ?? 0) + 1;
    bodyByCategory[category] = summary;
  }
  const exportReaderIds = new Set(contract.exportBooks
    .filter((book) => book.source === 'reader' && book.externalId)
    .map((book) => book.externalId!));
  const parentIds = new Set(contract.readerDocuments
    .filter((document) => document.category !== 'highlight' && document.category !== 'note')
    .map((document) => document.id));
  return {
    bodyByCategory,
    categoryCounts,
    export: {
      deletedBooks: contract.exportBooks.filter((book) => book.isDeleted).length,
      readerBookCount: exportReaderIds.size,
      readerDocumentJoinCount: [...exportReaderIds].filter((id) => parentIds.has(id)).length,
      totalBooks: contract.exportBooks.length
    },
    requestCount: contract.requestCount,
    responseShapes: { export: contract.exportShape, reader: contract.readerShape }
  };
}

export async function probeRawSourceRefresh(
  token: string,
  documents: ReaderDocumentContract[],
  options: { fetchImpl?: typeof fetch; waitForExpiry?: boolean } = {}
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const results = [];
  for (const category of ['pdf', 'epub'] as const) {
    const document = documents.find((item) => item.category === category && item.rawSourceUrl);
    if (!document?.rawSourceUrl) {
      results.push({ category, status: 'not_available' });
      continue;
    }
    const first = await downloadSummary(document.rawSourceUrl, fetchImpl);
    const expiresAt = signedUrlExpiresAt(document.rawSourceUrl);
    if (options.waitForExpiry && expiresAt) {
      const delay = Math.max(0, expiresAt - Date.now() + 2_000);
      if (delay > 3_700_000) throw new Error('raw_source_expiry_outside_probe_bound');
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const expiredStatus = options.waitForExpiry && expiresAt
      ? (await fetchImpl(document.rawSourceUrl, { redirect: 'manual' })).status
      : null;
    const refreshed = await fetchSingleDocument(token, document.id, fetchImpl);
    const second = refreshed?.rawSourceUrl ? await downloadSummary(refreshed.rawSourceUrl, fetchImpl) : null;
    results.push({
      category,
      first,
      expiredUrlRejected: expiredStatus === null ? null : expiredStatus === 401 || expiredStatus === 403,
      signedUrlExpiryKnown: expiresAt !== null,
      refreshedUrlChanged: refreshed?.rawSourceUrl !== document.rawSourceUrl,
      second,
      status: first.ok && second?.ok ? 'downloaded_twice' : 'download_failed'
    });
  }
  return results;
}

async function fetchSingleDocument(token: string, id: string, fetchImpl: typeof fetch) {
  const url = new URL(READER_LIST_URL);
  url.searchParams.set('id', id);
  url.searchParams.set('withRawSourceUrl', 'true');
  const payload = await requestJson(url, token, fetchImpl);
  return normalizeReaderDocument(Array.isArray(payload.results) ? payload.results[0] : null);
}

async function downloadSummary(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  const hash = createHash('sha256');
  const reader = response.body?.getReader();
  let bytes = 0;
  while (reader) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 536_870_912) {
      await reader.cancel();
      return { bytes, contentType: response.headers.get('content-type'), hash: null, ok: false, status: 413 };
    }
    hash.update(chunk.value);
  }
  return {
    bytes,
    contentType: response.headers.get('content-type'),
    hash: bytes ? hash.digest('hex') : null,
    ok: response.ok && bytes > 0,
    status: response.status
  };
}

async function fetchPages(
  request: (url: URL) => Promise<Record<string, unknown>>,
  endpoint: string,
  params: Record<string, string>
) {
  const results: unknown[] = [];
  let cursor: string | null = null;
  let requestCount = 0;
  let shape: unknown = null;
  do {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cursor) url.searchParams.set('pageCursor', cursor);
    const payload = await request(url);
    shape ??= stableShape(payload);
    results.push(...(Array.isArray(payload.results) ? payload.results : []));
    cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor ? payload.nextPageCursor : null;
    requestCount += 1;
  } while (cursor);
  return { requestCount, results, shape };
}

function rateLimitedRequest(token: string, fetchImpl: typeof fetch, minIntervalMs: number) {
  let lastRequestAt = 0;
  return async (url: URL) => {
    const delay = Math.max(0, lastRequestAt + minIntervalMs - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
    return requestJson(url, token, fetchImpl);
  };
}

async function requestJson(url: URL, token: string, fetchImpl: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url, { headers: { Authorization: `Token ${token}` } });
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    throw new Error(`readwise_http_${response.status}${retryAfter ? `_retry_after_${retryAfter}` : ''}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function signedUrlExpiresAt(value: string) {
  const url = new URL(value);
  const date = url.searchParams.get('X-Amz-Date');
  const duration = Number(url.searchParams.get('X-Amz-Expires'));
  if (date && /^\d{8}T\d{6}Z$/.test(date) && Number.isFinite(duration)) {
    const startedAt = Date.UTC(
      Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)),
      Number(date.slice(9, 11)), Number(date.slice(11, 13)), Number(date.slice(13, 15))
    );
    return startedAt + duration * 1_000;
  }
  const expires = Number(url.searchParams.get('Expires'));
  return Number.isFinite(expires) && expires > 0 ? expires * 1_000 : null;
}
