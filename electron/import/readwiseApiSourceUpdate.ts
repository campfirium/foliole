import { decodeTextBodyBlobData, upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { ReadwiseApiDocumentImportState, ReadwiseApiSourceUpdateState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';

export function persistReadwiseApiSourceUpdate(input: {
  currentBody: string | null | undefined;
  incomingBody: string;
  replaceExistingBody?: boolean;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}) {
  if (!input.currentBody || input.replaceExistingBody || input.currentBody === input.incomingBody) {
    return null;
  }
  const contentHash = upsertTextBodyBlob(
    openDatabaseConnection().driver,
    input.incomingBody,
    input.updatedAt
  );
  return {
    contentHash,
    sourceUpdatedAt: input.sourceUpdatedAt,
    status: 'pending'
  } satisfies ReadwiseApiSourceUpdateState;
}

export function loadReadwiseApiSourceUpdate(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{
    data: unknown;
    remote_import_state_json: string;
  }>(
    `SELECT cbd.data, i.remote_import_state_json FROM import_sources i
     JOIN content_blob_data cbd
       ON cbd.hash = json_extract(i.remote_import_state_json, '$.sourceUpdate.contentHash')
     WHERE i.latest_node_id = ? AND i.remote_provider = 'readwise'`,
    [nodeId]
  );
  if (!row) return null;
  let state: ReadwiseApiDocumentImportState | null = null;
  try { state = JSON.parse(row.remote_import_state_json) as ReadwiseApiDocumentImportState; } catch { return null; }
  if (state.sourceUpdate?.status !== 'pending') return null;
  const content = decodeTextBodyBlobData(row.data);
  return content === null ? null : {
    content,
    sourceUpdatedAt: state.sourceUpdate.sourceUpdatedAt
  };
}
