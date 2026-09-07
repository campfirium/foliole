import {
  normalizeExportBook,
  normalizeReaderDocument,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';

const READER_URL = 'https://readwise.io/api/v3/list/';
const EXPORT_URL = 'https://readwise.io/api/v2/export/';

export async function fetchReadwiseIdentityEvidence(input: {
  fetchImpl?: typeof fetch;
  ids: string[];
  minIntervalMs?: number;
  token: string;
}) {
  const request = rateLimitedRequest(input.token, input.fetchImpl ?? fetch, input.minIntervalMs ?? 3_100);
  const documents = new Map<string, ReaderDocumentContract>();
  for (const id of input.ids) await fetchChain(id, documents, request);
  const exportIds = await fetchExportIds(request);
  return { documents, exportIds };
}

async function fetchChain(
  id: string,
  documents: Map<string, ReaderDocumentContract>,
  request: (url: URL) => Promise<Record<string, unknown>>
) {
  let nextId: string | null = id;
  const seen = new Set<string>();
  while (nextId && !documents.has(nextId) && !seen.has(nextId)) {
    seen.add(nextId);
    const url = new URL(READER_URL);
    url.searchParams.set('id', nextId);
    const payload = await request(url);
    const document = normalizeReaderDocument(Array.isArray(payload.results) ? payload.results[0] : null);
    if (!document || document.id !== nextId) return;
    documents.set(document.id, document);
    nextId = document.category === 'highlight' || document.category === 'note' ? document.parentId : null;
  }
}

async function fetchExportIds(request: (url: URL) => Promise<Record<string, unknown>>) {
  const result = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URL(EXPORT_URL);
    url.searchParams.set('includeDeleted', 'true');
    if (cursor) url.searchParams.set('pageCursor', cursor);
    const payload = await request(url);
    for (const value of Array.isArray(payload.results) ? payload.results : []) {
      const book = normalizeExportBook(value);
      if (book?.source === 'reader' && book.externalId && !book.isDeleted) result.add(book.externalId);
    }
    cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
      ? payload.nextPageCursor : null;
  } while (cursor);
  return result;
}

function rateLimitedRequest(token: string, fetchImpl: typeof fetch, minIntervalMs: number) {
  let lastRequestAt = 0;
  return async (url: URL) => {
    const delay = Math.max(0, lastRequestAt + minIntervalMs - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
    const response = await fetchImpl(url, {
      headers: { Authorization: `Token ${token}` }, method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`readwise_identity_http_${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  };
}
