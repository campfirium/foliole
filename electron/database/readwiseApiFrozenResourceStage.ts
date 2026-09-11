import type { ReadwiseApiPreparedResources } from '../import/readwiseApiDocumentCommit.js';

import { openDatabaseConnection } from './connection.js';

const RESOURCE_KIND = 'candidate-resource-v1';

export function countReadwiseApiFrozenResources(connectionRef: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) count FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ?`,
    [connectionRef, RESOURCE_KIND]
  )?.count ?? 0;
}

export function loadReadwiseApiFrozenResources(
  connectionRef: string,
  documentId: string
): ReadwiseApiPreparedResources | null {
  const row = openDatabaseConnection().driver.queryOne<{ payload_json: string }>(
    `SELECT payload_json FROM readwise_api_import_stage
     WHERE connection_ref = ? AND record_kind = ? AND remote_id = ?`,
    [connectionRef, RESOURCE_KIND, documentId]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload_json) as ReadwiseApiPreparedResources;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveReadwiseApiFrozenResources(
  connectionRef: string,
  documentId: string,
  resources: ReadwiseApiPreparedResources
) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO readwise_api_import_stage (connection_ref, record_kind, remote_id, payload_json)
     VALUES (?, ?, ?, ?) ON CONFLICT(connection_ref, record_kind, remote_id)
     DO UPDATE SET payload_json = excluded.payload_json`,
    [connectionRef, RESOURCE_KIND, documentId, JSON.stringify(resources)]
  );
}
