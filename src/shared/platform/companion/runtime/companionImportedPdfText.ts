import { NODE_PDF_RESOURCES_SQL } from '../../../../../lib/core/database/nodePdfResourcesSql';
import type { WorkspaceNodeSnapshot } from '../../../../../lib/core/database/workspaceSnapshotHelpers';
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
      const node = await readPdfImportTopic(db, nodeId, pdf);
      if (!node && !await hasPdfReference(db, pdf)) return;
      await importPdfTextArtifact(db, source.storageKey, artifact.storageKey, artifact.text);
      await saveIndexState(db, pdf, null);
      const first = pages.find(page => page.text.trim());
      if (first && node?.deleted_at === null && node.placeholder) {
        await savePdfOpening(db, nodeId, node.title, first.text);
      }
    }, { kind: 'nodes', nodeIds: [nodeId] });
  } catch (error) {
    if (owner !== getIosCompanionDatabaseOwner()) return;
    await runCompanionHistoryMutation(async db => {
      assertOwner(owner);
      if (await readPdfImportTopic(db, nodeId, pdf) || await hasPdfReference(db, pdf)) {
        await saveIndexState(db, pdf, error instanceof Error ? error.message : 'PDF text extraction failed.');
      }
    }, { kind: 'nodes', nodeIds: [nodeId] });
  }
}

// Restoring reapplies the saved node version. Rebuild the local preview from its indexed original.
export async function restoreCompanionPdfOpenings(db: DbPort, nodes: readonly WorkspaceNodeSnapshot[]) {
  const targets = nodes.flatMap(node => {
    const pdf = node.resourceReferences?.find(reference =>
      reference.role === 'reference' && reference.storage_key.endsWith('.pdf'));
    return pdf ? [[node.id, pdf.storage_key.slice(0, -4)]] : [];
  });
  if (!targets.length) return;
  const rows = await db.query<{ id: string; title: string; text: string | null }>(
    `SELECT n.id, n.title, (
       SELECT text FROM pdf_page_text
       WHERE attachment_id = json_extract(target.value, '$[1]') AND trim(text) <> ''
       ORDER BY page LIMIT 1
     ) AS text
     FROM json_each(?) target JOIN nodes n ON n.id = json_extract(target.value, '$[0]')
     WHERE n.opening_text IS NULL AND instr(n.content, ?) > 0`, [JSON.stringify(targets), PDF_READER_PLACEHOLDER_TEXT]);
  for (const row of rows) {
    if (row.text) await savePdfOpening(db, row.id, row.title, row.text);
  }
}

function savePdfOpening(db: DbPort, nodeId: string, title: string, text: string) {
  return db.run('UPDATE nodes SET opening_text = ? WHERE id = ?', [resolveNodeOpeningText(text, title), nodeId]);
}

async function readPdfImportTopic(db: DbPort, nodeId: string, pdf: string) {
  const [topic] = await db.query<{ deleted_at: string | null; placeholder: number; title: string }>(
    `SELECT topic.title, topic.deleted_at, instr(topic.content, ?) AS placeholder
     FROM nodes topic JOIN (${NODE_PDF_RESOURCES_SQL}) reference ON reference.node_id = topic.id
     WHERE topic.id = ? AND reference.id = ?`, [PDF_READER_PLACEHOLDER_TEXT, nodeId, pdf]);
  return topic;
}

async function hasPdfReference(db: DbPort, pdf: string) {
  // Trashed Topics still own their original. Search includes them again on restore.
  return (await db.query(`SELECT 1 FROM (${NODE_PDF_RESOURCES_SQL}) WHERE id = ? LIMIT 1`, [pdf])).length > 0;
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
