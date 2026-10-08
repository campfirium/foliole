import { isBytes } from '@noble/hashes/utils.js';

import { assertTextBodyWithinBudget } from '../nodes/textBodyBudget.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { STORED_EXTERNAL_SOURCE_SEARCH_TRIGGERS } from './storedSourceSearchSchema.js';
import { hashTextBody } from './textBodyHash.js';

const NEXT = `SELECT document_id, content, body_blob_hash FROM external_documents
  WHERE document_id > ? ORDER BY document_id LIMIT 1`;
const BODY = `SELECT data.data, blob.kind, blob.compression, blob.original_size_bytes, blob.stored_size_bytes
  FROM content_blob_data data JOIN content_blobs blob ON blob.hash = data.hash WHERE data.hash = ?`;
const STORE = 'UPDATE external_documents SET content = ? WHERE document_id = ?';
type Document = { document_id: string; content: string; body_blob_hash: string | null };
type Body = { data: Uint8Array; kind: string; compression: string; original_size_bytes: number; stored_size_bytes: number };

function ownsBody(document: Document) {
  return !document.body_blob_hash || hashTextBody(document.content) === document.body_blob_hash;
}

function completeBody(document: Document, body?: Body) {
  if (ownsBody(document)) {
    assertTextBodyWithinBudget(document.content);
    return document.content;
  }
  if (!body || !isBytes(body.data) || body.kind !== 'text_body' || body.compression !== 'none' ||
      body.original_size_bytes !== body.data.byteLength || body.stored_size_bytes !== body.data.byteLength) {
    throw new Error(`external_document_body_migration_unavailable:${document.document_id}`);
  }
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.data);
  assertTextBodyWithinBudget(text);
  if (hashTextBody(text) !== document.body_blob_hash) {
    throw new Error(`external_document_body_migration_hash_mismatch:${document.document_id}`);
  }
  if (document.content !== '' && document.content !== text) {
    throw new Error(`external_document_body_migration_contradictory_inline:${document.document_id}`);
  }
  return text;
}

/** Convert only the known continuous legacy cache inside the schema owner's transaction. */
export function migrateExternalDocumentBodyOwnership(sqlite: DatabaseMigrationTarget) {
  for (const trigger of STORED_EXTERNAL_SOURCE_SEARCH_TRIGGERS) {
    const row = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?").all(trigger.name)[0] as { sql: string } | undefined;
    if (!row?.sql.includes('content_blob_data')) continue;
    sqlite.exec(`DROP TRIGGER ${trigger.name}`);
    sqlite.exec(trigger.sql);
  }
  let after = '';
  for (;;) {
    const document = sqlite.prepare(NEXT).all(after)[0] as Document | undefined;
    if (!document) return;
    after = document.document_id;
    const body = !ownsBody(document) && document.body_blob_hash
      ? sqlite.prepare(BODY).all(document.body_blob_hash)[0] as Body | undefined : undefined;
    sqlite.prepare(STORE).run(completeBody(document, body), document.document_id);
  }
}

export async function migrateCompanionExternalDocumentBodyOwnership(db: DbPort) {
  for (const trigger of STORED_EXTERNAL_SOURCE_SEARCH_TRIGGERS) {
    const [row] = await db.query<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", [trigger.name]);
    if (!row?.sql.includes('content_blob_data')) continue;
    await db.run(`DROP TRIGGER ${trigger.name}`);
    await db.run(trigger.sql);
  }
  let after = '';
  for (;;) {
    const [document] = await db.query<Document>(NEXT, [after]);
    if (!document) return;
    after = document.document_id;
    const [body] = !ownsBody(document) && document.body_blob_hash
      ? await db.query<Body>(BODY, [document.body_blob_hash]) : [];
    await db.run(STORE, [completeBody(document, body), document.document_id]);
  }
}
