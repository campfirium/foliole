import { computeSyncContentHash } from '../database/syncState.js';

import { buildCanonicalExternalDocumentPayload } from './canonicalExternalResourcePayload.js';
import { buildCanonicalSyncTombstone } from './canonicalSyncTombstone.js';
import type { DbPort, DbRow } from './dbPort.js';
import {
  buildSyncPackApplyableRowsSql,
  buildSyncPackExternalDocumentUpsertSql,
  type SyncPackApplyableRowsOptions
} from './syncPackApplyStatements.js';

export async function applySyncPackExternalDocumentsWithDbPort(
  port: DbPort,
  options: SyncPackApplyableRowsOptions = {}
) {
  await assertCanonicalExternalDocumentRows(port, options);
  const result = await port.run(buildSyncPackExternalDocumentUpsertSql(options));
  return result.changes;
}

async function assertCanonicalExternalDocumentRows(
  port: DbPort,
  options: SyncPackApplyableRowsOptions
) {
  const alias = options.incomingAlias ?? 'inc';
  const rows = await port.query<ExternalDocumentValidationRow>(
    `SELECT state.object_id, state.content_hash AS state_content_hash, state.deleted_at,
       document.folder_id, document.relative_path, document.file_name, document.extension,
       document.content_hash AS document_content_hash, document.title, document.body_blob_hash,
       document.reference_kind, document.reference_json
     FROM (${buildSyncPackApplyableRowsSql(options)}) state
     LEFT JOIN ${alias}.external_documents document ON document.document_id = state.object_id
     WHERE state.object_type = 'external_document'`
  );
  for (const row of rows) {
    const payload = row.deleted_at
      ? buildCanonicalSyncTombstone(row.object_id)
      : buildCanonicalExternalDocumentPayload({
        body_blob_hash: row.body_blob_hash, content_hash: required(row.document_content_hash),
        document_id: row.object_id, extension: required(row.extension), file_name: required(row.file_name),
        folder_id: required(row.folder_id), reference_json: row.reference_json,
        reference_kind: required(row.reference_kind), relative_path: required(row.relative_path),
        title: required(row.title)
      });
    if (computeSyncContentHash('external_document', payload) !== row.state_content_hash) {
      throw new Error('sync_content_hash_mismatch:external_document');
    }
  }
}

function required(value: string | null) {
  if (value === null) throw new Error('invalid_external_document_payload');
  return value;
}

interface ExternalDocumentValidationRow extends DbRow {
  body_blob_hash: string | null;
  deleted_at: string | null;
  document_content_hash: string | null;
  extension: string | null;
  file_name: string | null;
  folder_id: string | null;
  object_id: string;
  reference_json: string | null;
  reference_kind: string | null;
  relative_path: string | null;
  state_content_hash: string;
  title: string | null;
}
