import { openDatabaseConnection } from './connection.js';

export function insertPdfAttachment(input: { id: string; originalName: string; status: 'failed' | 'indexing' | 'pending' | 'ready' }) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, pdf_index_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.originalName, 'application/pdf', 128, '2026-03-01T00:00:00.000Z', input.status);
}

export function insertStaleSearchRows(nodeId: string, attachmentId = `${nodeId}-pdf`) {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare('INSERT INTO search.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(nodeId, '', `${nodeId} marker`, nodeId, '2026-05-26T00:00:00.000Z');
  connection.sqlite
    .prepare(
      `INSERT INTO search.pdf_search (
         title, path, text, node_id, attachment_id, page, updated_at, page_text_length
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nodeId, '', `${nodeId} pdf marker`, nodeId, attachmentId, 1, '2026-05-26T00:00:00.000Z', 20);
}

export function enqueueSubtreeDeletedInvalidation(nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO search_index_invalidations (
         invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
       ) VALUES (?, ?, 'pending', 0, NULL, ?, ?, NULL, NULL)`
    )
    .run('node_subtree_deleted', nodeId, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
}
