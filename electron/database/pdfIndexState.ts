import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';

import { openDatabaseConnection } from './connection.js';

export function isMountedPdf(attachmentId: string) {
  if (!parseCanonicalAttachmentStorageKey(`${attachmentId}.pdf`)) return false;
  return Boolean(openDatabaseConnection().driver.queryOne(
    `SELECT 1 FROM nodes n, json_each(n.resource_references) resource
     WHERE json_extract(resource.value, '$.storage_key') = ?
       AND json_extract(resource.value, '$.role') = 'reference' LIMIT 1`, [`${attachmentId}.pdf`]
  ));
}

export function readPdfIndexAttempt(attachmentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ attempt: number | null }>(
    'SELECT attempt FROM pdf_index_state WHERE attachment_id = ?', [attachmentId]
  );
  return Math.max(0, row?.attempt ?? 0);
}

export function updatePdfIndexStatus(input: {
  attachmentId: string; error: string | null; indexedAt: string | null;
  status: 'failed' | 'indexing' | 'pending' | 'ready';
}) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO pdf_index_state (attachment_id, status, indexed_at, error, version, attempt)
     VALUES (?, ?, ?, ?, 1, 0) ON CONFLICT(attachment_id) DO UPDATE SET
       status = excluded.status, indexed_at = excluded.indexed_at, error = excluded.error, version = 1`,
    [input.attachmentId, input.status, input.indexedAt, input.error]
  );
}

export function beginPdfIndexAttempt(attachmentId: string) {
  openDatabaseConnection().driver.execute(
    `UPDATE pdf_index_state SET status = 'indexing', attempt = COALESCE(attempt, 0) + 1,
      error = NULL, version = 1 WHERE attachment_id = ?`, [attachmentId]
  );
}

export function resetPdfIndexState(attachmentId: string) {
  updatePdfIndexStatus({ attachmentId, error: null, indexedAt: null, status: 'pending' });
  openDatabaseConnection().driver.execute('UPDATE pdf_index_state SET attempt = 0 WHERE attachment_id = ?', [attachmentId]);
}
