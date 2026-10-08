import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import type { ReadwiseApiDocumentImportState, ReadwiseApiSourceUpdateState } from '../../lib/core/readwise/readwiseApiImportState.js';
import { openDatabaseConnection } from '../database/connection.js';

export function persistReadwiseApiSourceUpdate(input: {
  currentBody: string | null | undefined;
  incomingBody: string;
  replaceExistingBody?: boolean;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}) {
  if (!input.currentBody || input.replaceExistingBody || input.currentBody === input.incomingBody) return null;
  return { content: input.incomingBody, contentHash: hashTextBody(input.incomingBody),
    sourceUpdatedAt: input.sourceUpdatedAt, status: 'pending' } satisfies ReadwiseApiSourceUpdateState;
}

export function loadReadwiseApiSourceUpdate(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ remote_import_state_json: string }>(
    `SELECT remote_import_state_json FROM import_sources
     WHERE latest_node_id = ? AND remote_provider = 'readwise'`, [nodeId]);
  if (!row) return null;
  let state: ReadwiseApiDocumentImportState;
  try { state = JSON.parse(row.remote_import_state_json) as ReadwiseApiDocumentImportState; } catch { return null; }
  const update = state.sourceUpdate;
  if (update?.status !== 'pending') return null;
  if (typeof update.content !== 'string' || hashTextBody(update.content) !== update.contentHash) {
    throw new Error('readwise_source_update_body_invalid');
  }
  return { content: update.content, sourceUpdatedAt: update.sourceUpdatedAt };
}
