import { openDatabaseConnection } from './connection.js';

export function insertPdfAttachment(input: { id: string; originalName: string; status: 'failed' | 'indexing' | 'pending' | 'ready' }) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, pdf_index_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.originalName, 'application/pdf', 128, '2026-03-01T00:00:00.000Z', input.status);
}
