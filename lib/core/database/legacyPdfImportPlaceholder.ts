import { PDF_READER_PLACEHOLDER_TEXT } from '../nodes/nodeOpeningPreview.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import { parseNodeResourceReferences } from './nodeResourceReferences.js';

interface PdfImportRow extends Record<string, unknown> {
  content: string;
  title: string;
  source_name: string;
  resource_references: string;
}

const IMPORT = `SELECT n.content, n.title, n.resource_references, s.source_name
    FROM nodes n JOIN import_sources s ON s.latest_node_id = n.id
      AND s.source_fingerprint = n.import_source_fingerprint
    WHERE n.id = ? AND s.provider = 'desktop_text_file' AND s.source_kind = 'pdf'`;
const PAGES = 'SELECT page, text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page';
type Page = { page: number; text: string };

/** Confirm both historical representations from independent import and page facts. */
export function isLegacyPdfImportPlaceholder(driver: Pick<DatabaseDriver, 'queryOne' | 'queryAll'>, nodeId: string, body: string) {
  const row = driver.queryOne<PdfImportRow>(IMPORT, [nodeId]);
  return Boolean(row && placeholderPdfIds(row).some((id) =>
    matchesPdfPages(driver.queryAll<Page>(PAGES, [id]), row.title, body)));
}

export async function isCompanionLegacyPdfImportPlaceholder(db: DbPort, nodeId: string, body: string) {
  const [row] = await db.query<PdfImportRow>(IMPORT, [nodeId]);
  if (!row) return false;
  for (const id of placeholderPdfIds(row)) {
    if (matchesPdfPages(await db.query<Page>(PAGES, [id]), row.title, body)) return true;
  }
  return false;
}

function placeholderPdfIds(row: PdfImportRow) {
  const sourceTitle = row.source_name.replace(/^.*[/\\]/, '').replace(/\.[^.]*$/, '');
  if (row.content !== `# ${sourceTitle}\n\n${PDF_READER_PLACEHOLDER_TEXT}`) return [];
  let references;
  try { references = parseNodeResourceReferences(row.resource_references); } catch { return []; }
  const pdfs = references.filter((ref) => ref.role === 'reference' && /^[a-f0-9]{64}\.pdf$/.test(ref.storage_key));
  return pdfs.map((ref) => ref.storage_key.slice(0, -4));
}

function matchesPdfPages(pages: Page[], title: string, body: string) {
  if (pages.length === 0 || pages.some((row, index) => row.page !== index + 1)) return false;
  const text = pages.map((row) => row.text.trim()).filter(Boolean).join('\n\n');
  return text !== '' && body === `# ${title.trim() || 'Untitled'}\n\n${text}`;
}
