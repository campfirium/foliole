import { PDF_READER_PLACEHOLDER_TEXT, resolveNodeOpeningText } from '../../../../../lib/core/nodes/nodeOpeningPreview';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { buildPdfTextArtifact, importPdfTextArtifact, PDF_TEXT_EXTRACTOR_VERSION } from '../../../../../lib/core/sync/pdfTextArtifact';

import { runCompanionHistoryMutation } from './companionFlowHistory';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

type Owner = ReturnType<typeof getIosCompanionDatabaseOwner>;

/** Original metadata is already committed. Derived text failure must never roll it back. */
export async function completeCompanionPdfTextImport(source: { storageKey: string; bytes: Uint8Array },
  nodeId: string, owner: Owner, signal?: AbortSignal) {
  const pdf = source.storageKey.slice(0, 64);
  try {
    const { extractRuntimePdfPageText } = await import('../../runtime/pdfPageTextExtraction');
    const pages = await extractRuntimePdfPageText(source.bytes, signal);
    const artifact = buildPdfTextArtifact(pdf, pages.map(page => ({ page: page.page, text: page.text,
      page_width: page.pageWidth, page_height: page.pageHeight })));
    await runCompanionHistoryMutation(async db => {
      assertOwner(owner); signal?.throwIfAborted();
      await importPdfTextArtifact(db, source.storageKey, artifact.storageKey, artifact.text);
      await saveIndexState(db, pdf, null);
      const first = pages.find(page => page.text.trim());
      const [node] = await db.query<{ title: string }>('SELECT title FROM nodes WHERE id = ? AND instr(content,?) > 0',
        [nodeId, PDF_READER_PLACEHOLDER_TEXT]);
      if (first && node) await db.run('UPDATE nodes SET opening_text = ? WHERE id = ?', [resolveNodeOpeningText(first.text, node.title), nodeId]);
    }, { kind: 'nodes', nodeIds: [nodeId] });
  } catch (error) {
    if (owner !== getIosCompanionDatabaseOwner()) return;
    await runCompanionHistoryMutation(async db => {
      assertOwner(owner);
      await saveIndexState(db, pdf, error instanceof Error ? error.message : 'PDF text extraction failed.');
    }, { kind: 'nodes', nodeIds: [nodeId] });
  }
}

function assertOwner(owner: Owner) {
  if (owner !== getIosCompanionDatabaseOwner()) throw new Error('Import library changed.');
}

async function saveIndexState(db: DbPort, pdf: string, error: string | null) {
  await db.run(`INSERT INTO pdf_index_state(attachment_id,status,indexed_at,error,version,attempt) VALUES(?,?,?,?,?,1)
    ON CONFLICT(attachment_id) DO UPDATE SET status=excluded.status,indexed_at=excluded.indexed_at,
      error=excluded.error,version=excluded.version,attempt=COALESCE(attempt,0)+1
    WHERE excluded.status='ready' OR pdf_index_state.status IS NOT 'ready'`,
  [pdf, error === null ? 'ready' : 'failed', error === null ? new Date().toISOString() : null, error, PDF_TEXT_EXTRACTOR_VERSION]);
}
