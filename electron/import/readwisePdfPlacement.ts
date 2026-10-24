import { promises as fs } from 'node:fs';

import { parseHighlightCardContent } from '../../lib/core/annotations/textAnnotationContent.js';
import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import { locateReadwiseTextInPdf, type PdfPageForMatch } from '../../lib/core/readwise/readwisePdfMatch.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { extractPdfMatchPagesOffMainThread } from '../database/pdfPageTextWorkerClient.js';
import { loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';

interface HighlightRow extends DatabaseRow {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

export function readReadwisePdfPages(bytes: Uint8Array): Promise<PdfPageForMatch[]> {
  return extractPdfMatchPagesOffMainThread(bytes);
}

export function placeReadwisePdfHighlights(input: {
  connectionRef: string;
  documentId: string;
  nodeId: string;
  pages: PdfPageForMatch[];
}) {
  const driver = openDatabaseConnection().driver;
  const source = loadReadwiseApiImportSource(input.connectionRef, input.documentId);
  if (!source || source.nodeId !== input.nodeId) throw new Error('readwise_pdf_target_changed');
  const rows = source.state.annotations.filter((annotation) => annotation.kind === 'highlight' && annotation.remoteStatus !== 'deleted')
    .map((annotation) => driver.queryOne<HighlightRow>(
      'SELECT id, parent_id, anchor_link FROM nodes WHERE id = ? AND deleted_at IS NULL', [annotation.nodeId]
    )).filter((row): row is HighlightRow => Boolean(row && row.parent_id === input.nodeId));
  const now = new Date().toISOString();
  driver.transaction(() => {
    for (const row of rows) {
      const anchor = parseStoredAnchorLink(row.anchor_link);
      const raw = row.anchor_link ? JSON.parse(row.anchor_link) as Record<string, unknown> : {};
      if (row.anchor_link && (!anchor || anchor.kind !== 'highlight' || raw.origin !== 'imported')) continue;
      const body = loadNodeBodyResolution(driver, row.id);
      if (!body) throw new NodeBodyUnavailableError([row.id]);
      const text = parseHighlightCardContent({ content: body.content }).text;
      if (anchor?.locator && 'page' in anchor.locator && raw.pdfMatchText === text) continue;
      if (anchor?.locator && 'page' in anchor.locator && typeof raw.pdfMatchText !== 'string') continue;
      const locator = locateReadwiseTextInPdf(input.pages, text);
      const next = JSON.stringify({
        id: anchor?.id ?? `imported-highlight-${row.id}`, kind: 'highlight', origin: 'imported', pdfMatchText: text,
        ...(locator ? { locator } : {})
      });
      if (next === row.anchor_link) continue;
      driver.execute('UPDATE nodes SET anchor_link = ?, image_regions = NULL, updated_at = ?, sync_dirty = 1 WHERE id = ?', [next, now, row.id]);
    }
  });
}

export async function placeReadwisePdfHighlightsFromAttachment(input: {
  attachmentId: string;
  connectionRef: string;
  documentId: string;
  nodeId: string;
}) {
  const file = await resolveAttachmentFile(`${input.attachmentId}.pdf`);
  if (file.status !== 'ready') return;
  const pages = await readReadwisePdfPages(await fs.readFile(file.filePath));
  await runWithDatabaseConnectionOwner(() => placeReadwisePdfHighlights({ connectionRef: input.connectionRef,
    documentId: input.documentId,
    nodeId: input.nodeId,
    pages
  }));
}
