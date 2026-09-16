import { openDatabaseConnection } from './connection.js';

export function loadReadwiseCutoverStage<T>(connectionRef: string, kind: string, id = 'batch'): T | null {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    'SELECT payload_json FROM readwise_api_import_stage WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?',
    [connectionRef, kind, id]
  );
  if (!row) return null;
  try { return JSON.parse(row.payload_json) as T; } catch {
    throw new Error('readwise_source_cutover_stage_corrupt');
  }
}

export function saveReadwiseCutoverStage(connectionRef: string, kind: string, value: unknown, id = 'batch') {
  openDatabaseConnection().driver.execute(
    `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
     VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
     DO UPDATE SET payload_json = excluded.payload_json`,
    [connectionRef, kind, id, JSON.stringify(value)]
  );
}
