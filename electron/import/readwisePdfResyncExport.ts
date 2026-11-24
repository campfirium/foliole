import { normalizeExportBook } from '../../lib/core/readwise/readwiseApiContract.js';
import {
  prepareReadwiseExportHighlight,
  type PreparedReadwiseApiAnnotation
} from '../../lib/core/readwise/readwiseApiImport.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { readwiseApiOverlapBoundary } from '../database/readwiseApiImportState.js';

import {
  createReadwiseApiRequest,
  READWISE_EXPORT_URL,
  type ReadwiseApiFetchDependencies
} from './readwiseApiImportFetch.js';
import { createReadwiseApiPageParser } from './readwiseApiPage.js';
import type { ReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

const MAX_EXPORT_PAGES = 250;
const EXPORT_TIMEOUT_MS = 15 * 60_000;

export async function prepareReadwisePdfResyncExport(
  target: ReadwiseSourceResyncTarget,
  dependencies: ReadwiseApiFetchDependencies
) {
  const startedAt = new Date().toISOString();
  const timeout = AbortSignal.timeout(EXPORT_TIMEOUT_MS);
  const signal = dependencies.signal ? AbortSignal.any([dependencies.signal, timeout]) : timeout;
  const request = await runWithDatabaseConnectionOwner(() =>
    createReadwiseApiRequest({ ...dependencies, signal }, target.connectionRef));
  const annotations = new Map<string, PreparedReadwiseApiAnnotation>();
  const checkedAt = target.state.pdfAnnotationsCheckedAt;
  const updatedAfter = checkedAt ? readwiseApiOverlapBoundary(checkedAt) : null;
  const parse = createReadwiseApiPageParser();
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_EXPORT_PAGES; page += 1) {
      const url = new URL(READWISE_EXPORT_URL);
      if (updatedAfter) url.searchParams.set('updatedAfter', updatedAfter);
      if (cursor) url.searchParams.set('pageCursor', cursor);
      const response = await request(url);
      signal.throwIfAborted();
      const parsed = parse(response);
      collectPdfHighlights(annotations, parsed.results, target.documentId);
      cursor = parsed.cursor;
      if (cursor === null) return { annotations: [...annotations.values()], startedAt };
    }
  } catch (error) {
    if (timeout.aborted) throw new Error('readwise_pdf_export_timed_out', { cause: error });
    if (dependencies.signal?.aborted) throw new Error('readwise_pdf_resync_cancelled', { cause: error });
    throw error;
  }
  throw new Error('readwise_pdf_export_page_limit');
}

function collectPdfHighlights(
  annotations: Map<string, PreparedReadwiseApiAnnotation>,
  results: unknown[],
  documentId: string
) {
  for (const result of results) {
    if (!result || typeof result !== 'object') continue;
    const row = result as Record<string, unknown>;
    if (row.source !== 'reader' || row.external_id !== documentId || row.is_deleted === true) continue;
    const book = normalizeExportBook(row);
    if (!book || !Array.isArray(row.highlights) || book.highlights.length !== row.highlights.length) {
      throw new Error('readwise_pdf_export_highlights_invalid');
    }
    for (const highlight of book.highlights) {
      const annotation = prepareReadwiseExportHighlight(highlight, documentId);
      if (annotation) keepLatestHighlight(annotations, annotation);
    }
  }
}

function keepLatestHighlight(
  annotations: Map<string, PreparedReadwiseApiAnnotation>,
  annotation: PreparedReadwiseApiAnnotation
) {
  const previous = annotations.get(annotation.remoteId);
  if (!previous) {
    annotations.set(annotation.remoteId, annotation);
    return;
  }
  const previousTime = Date.parse(previous.updatedAt ?? '');
  const nextTime = Date.parse(annotation.updatedAt ?? '');
  if (nextTime > previousTime || (Number.isNaN(previousTime) && Number.isFinite(nextTime))) {
    annotations.set(annotation.remoteId, annotation);
  } else if (!(nextTime < previousTime) && previous.contentHash !== annotation.contentHash) {
    throw new Error('readwise_pdf_export_highlight_conflict');
  }
}
