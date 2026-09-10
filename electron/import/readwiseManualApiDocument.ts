import { normalizeExportBook, normalizeReaderDocument, type ExportBookContract } from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import { createReadwiseApiRequest, READWISE_EXPORT_URL, READWISE_READER_LIST_URL, type ReadwiseApiFetchDependencies } from './readwiseApiImportFetch.js';

export async function fetchReadwiseManualDocument(id: string, dependencies: ReadwiseApiFetchDependencies = {}) {
  const request = createReadwiseApiRequest(dependencies);
  const parent = await exactDocument(id, true, request);
  if (!parent || parent.parentId || parent.category === 'highlight' || parent.category === 'note') {
    throw new Error('readwise_api_candidate_parent_missing');
  }
  const books = await exportForParent(id, request);
  const reader = [parent];
  for (const highlightId of new Set(books.flatMap((book) => book.highlights.filter((item) => !item.isDeleted).map((item) => item.externalId)))) {
    const highlight = await exactDocument(highlightId, false, request);
    if (!highlight || highlight.category !== 'highlight' || highlight.parentId !== id) {
      throw new Error('readwise_api_candidate_highlight_mismatch');
    }
    reader.push(highlight);
  }
  const document = prepareReadwiseApiDocuments(reader, books).find((item) => item.id === id);
  if (!document) throw new Error('readwise_api_candidate_parent_missing');
  return document;
}

async function exactDocument(id: string, body: boolean, request: ReturnType<typeof createReadwiseApiRequest>) {
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('id', id);
  if (body) url.searchParams.set('withHtmlContent', 'true');
  const payload = await request(url);
  if (!Array.isArray(payload.results)) throw new Error('readwise_search_invalid_page');
  return payload.results.map(normalizeReaderDocument).find((item) => item?.id === id) ?? null;
}

async function exportForParent(id: string, request: ReturnType<typeof createReadwiseApiRequest>) {
  let cursor: string | null = null;
  const seen = new Set<string>();
  const books: ExportBookContract[] = [];
  do {
    const url = new URL(READWISE_EXPORT_URL);
    url.searchParams.set('includeDeleted', 'true');
    if (cursor) url.searchParams.set('pageCursor', cursor);
    const payload = await request(url);
    if (!Array.isArray(payload.results)) throw new Error('readwise_search_invalid_page');
    for (const value of payload.results) {
      const book = normalizeExportBook(value);
      if (book?.externalId === id && book.source === 'reader' && !book.isDeleted) books.push(book);
    }
    cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor ? payload.nextPageCursor : null;
    if (cursor && (seen.has(cursor) || seen.size >= 1_000)) throw new Error('readwise_search_page_limit');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return books;
}
