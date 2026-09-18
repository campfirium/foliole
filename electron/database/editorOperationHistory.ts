import { openDatabaseConnection } from './connection.js';

const MAX_HISTORY_PAYLOAD_BYTES = 8 * 1024 * 1024;

function assertHistoryPayload(payloadJson: string) {
  if (Buffer.byteLength(payloadJson, 'utf8') > MAX_HISTORY_PAYLOAD_BYTES) {
    throw new Error('editor operation history payload exceeds storage limit');
  }
  const parsed = JSON.parse(payloadJson) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('editor operation history payload must be a JSON object');
  }
}

export function loadEditorOperationHistory() {
  const row = openDatabaseConnection().sqlite.prepare(
    'SELECT payload_json FROM editor_operation_history WHERE singleton_id = 1'
  ).get() as { payload_json: string } | undefined;
  return row?.payload_json ?? null;
}

export function saveEditorOperationHistory(payloadJson: string) {
  assertHistoryPayload(payloadJson);
  openDatabaseConnection().sqlite.prepare(
    `INSERT INTO editor_operation_history (singleton_id, payload_json, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(singleton_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`
  ).run(payloadJson, new Date().toISOString());
}
