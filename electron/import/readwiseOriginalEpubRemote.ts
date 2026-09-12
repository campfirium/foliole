import {
  normalizeExportBook,
  normalizeReaderDocument,
  type ExportBookContract,
  type ReaderDocumentContract
} from '../../lib/core/readwise/readwiseApiContract.js';
import { prepareReadwiseApiDocuments } from '../../lib/core/readwise/readwiseApiImport.js';

import {
  createReadwiseApiRequest,
  READWISE_EXPORT_URL,
  READWISE_READER_LIST_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';

async function fetchPages<T>(input: {
  buildUrl: (cursor: string | null) => URL;
  normalize: (value: unknown) => T | null;
  onPage?: (count: number) => void;
  request: (url: URL) => Promise<Record<string, unknown>>;
}) {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const payload = await input.request(input.buildUrl(cursor));
    const page = (Array.isArray(payload.results) ? payload.results : [])
      .map(input.normalize).filter((item): item is T => item !== null);
    items.push(...page);
    input.onPage?.(page.length);
    cursor = typeof payload.nextPageCursor === 'string' && payload.nextPageCursor
      ? payload.nextPageCursor : null;
  } while (cursor);
  return items;
}

function readerPageUrl(category: 'highlight' | 'note', cursor: string | null) {
  const url = new URL(READWISE_READER_LIST_URL);
  url.searchParams.set('category', category);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('pageCursor', cursor);
  return url;
}

function exportPageUrl(cursor: string | null) {
  const url = new URL(READWISE_EXPORT_URL);
  if (cursor) url.searchParams.set('pageCursor', cursor);
  return url;
}

export async function fetchOriginalEpubRemoteRoot(input: {
  dependencies?: ReadwiseApiFetchDependencies;
  documentId: string;
}) {
  const request = createReadwiseApiRequest(input.dependencies);
  const rootUrl = new URL(READWISE_READER_LIST_URL);
  rootUrl.searchParams.set('id', input.documentId);
  rootUrl.searchParams.set('withHtmlContent', 'true');
  rootUrl.searchParams.set('withRawSourceUrl', 'true');
  const rootPayload = await request(rootUrl);
  const root = (Array.isArray(rootPayload.results) ? rootPayload.results : [])
    .map(normalizeReaderDocument).find((document) => document?.id === input.documentId) ?? null;
  if (!root || root.category !== 'epub') throw new Error('original_epub_target_missing');
  if (!root.rawSourceUrl) throw new Error('original_epub_not_distributed');
  return { rawSourceUrl: root.rawSourceUrl, root };
}

export async function fetchOriginalEpubRemoteAnnotations(input: {
  dependencies?: ReadwiseApiFetchDependencies;
  documentId: string;
  onPage?: (count: number) => void;
  root: ReaderDocumentContract;
}) {
  const request = createReadwiseApiRequest(input.dependencies);
  const readerDocuments: ReaderDocumentContract[] = [input.root];
  for (const category of ['highlight', 'note'] as const) {
    readerDocuments.push(...await fetchPages({
      buildUrl: (cursor) => readerPageUrl(category, cursor),
      normalize: normalizeReaderDocument,
      ...(input.onPage ? { onPage: input.onPage } : {}),
      request
    }));
  }
  const exportBooks = await fetchPages<ExportBookContract>({
    buildUrl: exportPageUrl,
    normalize: normalizeExportBook,
    ...(input.onPage ? { onPage: input.onPage } : {}),
    request
  });
  const prepared = prepareReadwiseApiDocuments(readerDocuments, exportBooks)
    .find((document) => document.id === input.documentId);
  if (!prepared || prepared.unmatchedAnnotationCount > 0) {
    throw new Error('original_epub_highlights_incomplete');
  }
  return prepared;
}
