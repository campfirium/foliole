import { READ_READING_RESUME_SQL } from '../../../../../lib/core/sync/readingResumeApply';
import { parseReadingResumeState, readReadingResumeOffset } from '../../../../../lib/core/sync/readingResumeState';
import { decodePdfReadingPosition, pdfReadingContentHash } from '../../../../../lib/platform/pdfReadingPosition';
import type { CompanionReadableArticle } from '../../companionReadableArticle';
import { logRuntimeWarning } from '../../runtimeLogging';
import { readIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';

export async function loadCompanionPdfTextResume(article: CompanionReadableArticle) {
  const attachment = article.pdfAttachmentId;
  if (!attachment || article.isTrashed || article.bodyStatus !== 'ready') return undefined;
  const local = article.persistedNodeViewState;
  if (local && (local.scrollTop > 0 || (local.selectionFrom ?? 0) > 0)) return undefined;
  try {
    return await readIosCompanionDatabase(async db => {
      const [record] = await db.query<{ payload_json: string }>(READ_READING_RESUME_SQL, [article.nodeId]);
      if (!record) return undefined;
      const offset = readReadingResumeOffset(parseReadingResumeState(record.payload_json), pdfReadingContentHash(attachment));
      if (offset === undefined) return undefined;
      const { page } = decodePdfReadingPosition(offset);
      const pages = await db.query<{ page: number; text: string }>(
        "SELECT page, TRIM(text) AS text FROM pdf_page_text WHERE attachment_id = ? AND TRIM(text) <> '' ORDER BY page",
        [attachment]);
      const headerEnd = article.content.indexOf('\n\n');
      if (headerEnd < 0 || !article.content.startsWith('# ') ||
          article.content.slice(headerEnd + 2) !== pages.map(row => row.text).join('\n\n')) return undefined;
      let start = headerEnd + 2;
      for (const row of pages) {
        if (row.page === page) return start;
        start += row.text.length + 2;
      }
      return undefined;
    });
  } catch (error) {
    logRuntimeWarning('PDF text resume lookup failed', { area: 'persistence', action: 'load_companion_pdf_text_resume', error });
    return undefined;
  }
}
