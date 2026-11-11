import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { READ_READING_RESUME_SQL } from '../../../../../lib/core/sync/readingResumeApply';
import { parseReadingResumeState, readReadingResumeClock, readReadingResumeOffset } from '../../../../../lib/core/sync/readingResumeState';
import { decodePdfReadingPosition, pdfReadingContentHash } from '../../../../../lib/platform/pdfReadingPosition';
import type { CompanionReadableArticle } from '../../companionReadableArticle';
import { logRuntimeWarning } from '../../runtimeLogging';
import { readIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';

export type CompanionPdfReadingContext = {
  attachmentId: string;
  versionId: string | null;
  epoch: string;
  clock: Record<string, number>;
  offset: number | null;
};

type PdfTextPage = { page: number; text: string };

function projectedPageStarts(content: string, pages: PdfTextPage[]) {
  const headerEnd = content.indexOf('\n\n');
  if (headerEnd < 0 || !content.startsWith('# ') ||
      content.slice(headerEnd + 2) !== pages.map(row => row.text).join('\n\n')) return [];
  let start = headerEnd + 2;
  return pages.map(row => {
    const entry = { page: row.page, start };
    start += row.text.length + 2;
    return entry;
  });
}

async function readPdfResume(db: DbPort, nodeId: string, attachmentId: string) {
  const [record] = await db.query<{ payload_json: string }>(READ_READING_RESUME_SQL, [nodeId]);
  const state = record ? parseReadingResumeState(record.payload_json) : null;
  return { clock: readReadingResumeClock(state),
    offset: readReadingResumeOffset(state, pdfReadingContentHash(attachmentId)) ?? null };
}

export async function refreshCompanionPdfReadingContext(nodeId: string, context: CompanionPdfReadingContext) {
  return readIosCompanionDatabase(async db => ({ ...context, ...await readPdfResume(db, nodeId, context.attachmentId) }));
}

export function companionPdfPageAtTextOffset(starts: readonly { page: number; start: number }[], offset: number) {
  let page = starts[0]?.page;
  for (const row of starts) {
    if (row.start > offset) break;
    page = row.page;
  }
  return page;
}

export async function loadCompanionPdfTextResume(article: CompanionReadableArticle) {
  const attachmentId = article.pdfAttachmentId;
  if (!attachmentId || article.isTrashed || article.bodyStatus !== 'ready') return undefined;
  try {
    return await readIosCompanionDatabase(async db => {
      const [epoch] = await db.query<{ source_epoch: string }>('SELECT source_epoch FROM sync_state_sequence WHERE singleton_id = 1');
      if (!epoch) return undefined;
      const { offset, clock } = await readPdfResume(db, article.nodeId, attachmentId);
      const pages = await db.query<PdfTextPage>(
        "SELECT page, TRIM(text) AS text FROM pdf_page_text WHERE attachment_id = ? AND TRIM(text) <> '' ORDER BY page",
        [attachmentId]);
      const starts = projectedPageStarts(article.content, pages);
      if (!starts.length) return undefined;
      const [local] = await db.query<{ reading_offset: number | null }>(
        `SELECT reading_offset FROM node_view_state WHERE node_id = ?
         AND host_name = (SELECT value FROM companion_meta WHERE key = 'host_name')`, [article.nodeId]);
      const localOffset = local?.reading_offset;
      const localPage = localOffset == null ? undefined
        : companionPdfPageAtTextOffset(starts, localOffset);
      const sharedPage = offset === null ? undefined : decodePdfReadingPosition(offset).page;
      const start = sharedPage !== localPage ? starts.find(row => row.page === sharedPage)?.start : undefined;
      const context: CompanionPdfReadingContext = { attachmentId, versionId: article.currentVersionId ?? null,
        epoch: epoch.source_epoch, clock, offset };
      return { ...article, pdfTextReading: { context, starts },
        ...(start !== undefined ? { pdfResumeTextOffset: start } : {}) };
    });
  } catch (error) {
    logRuntimeWarning('PDF text resume lookup failed', { area: 'persistence', action: 'load_companion_pdf_text_resume', error });
    return undefined;
  }
}
