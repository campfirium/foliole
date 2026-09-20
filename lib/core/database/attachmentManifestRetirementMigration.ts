import type { DbPort } from '../sync/dbPort.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../sync/syncObjectPayloadSql.js';

import { ATTACHMENT_RETIREMENT_ROWS_SQL, validateAttachmentManifestRetirement, type RetiringAttachmentRow } from './attachmentManifestRetirement.js';
import { computeCompanionContentHash } from './companionHostStateHashes.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const EXISTS = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'attachment_blobs'";
const INVALID_RELATIONS = `SELECT na.attachment_id FROM node_attachments na
  LEFT JOIN attachments a ON a.id = na.attachment_id WHERE a.id IS NULL
  UNION ALL SELECT p.attachment_id FROM pdf_page_text p
  LEFT JOIN attachments a ON a.id = p.attachment_id WHERE a.id IS NULL LIMIT 1`;
const UPDATE_METADATA = 'UPDATE attachments SET mime_type = ?, size_bytes = ? WHERE id = ?';
const UPDATE_STATE = `UPDATE sync_object_state SET content_hash = ?, sync_dirty = 1,
  state_seq = COALESCE((SELECT MAX(state_seq) + 1 FROM sync_object_state), 1)
  WHERE object_type = 'attachment' AND object_id = ? AND deleted_at IS NULL AND content_hash != ?`;

function payloadHash(rows: unknown[]) {
  const row = rows[0] as { payload_json: string } | undefined;
  if (!row) throw new Error('attachment_manifest_retirement_missing_metadata');
  return computeCompanionContentHash(JSON.parse(row.payload_json));
}

export function retireAttachmentManifest(sqlite: DatabaseMigrationTarget) {
  if (!sqlite.prepare(EXISTS).all().length) return;
  const entries = validateAttachmentManifestRetirement(sqlite.prepare(ATTACHMENT_RETIREMENT_ROWS_SQL).all() as RetiringAttachmentRow[]);
  if (sqlite.prepare(INVALID_RELATIONS).all().length) throw new Error('attachment_manifest_retirement_dangling_relation');
  for (const entry of entries) {
    sqlite.prepare(UPDATE_METADATA).run(entry.mimeType, entry.sizeBytes, entry.id);
    const hash = payloadHash(sqlite.prepare(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.attachment).all(entry.id));
    sqlite.prepare(UPDATE_STATE).run(hash, entry.id, hash);
  }
  sqlite.exec('DROP TABLE attachment_blobs');
}

export async function retireCompanionAttachmentManifest(db: DbPort) {
  if (!(await db.query(EXISTS)).length) return;
  const entries = validateAttachmentManifestRetirement(await db.query<RetiringAttachmentRow & Record<string, unknown>>(ATTACHMENT_RETIREMENT_ROWS_SQL));
  if ((await db.query(INVALID_RELATIONS)).length) throw new Error('attachment_manifest_retirement_dangling_relation');
  for (const entry of entries) {
    await db.run(UPDATE_METADATA, [entry.mimeType, entry.sizeBytes, entry.id]);
    const hash = payloadHash(await db.query(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.attachment, [entry.id]));
    await db.run(UPDATE_STATE, [hash, entry.id, hash]);
  }
  await db.run('DROP TABLE attachment_blobs');
}
