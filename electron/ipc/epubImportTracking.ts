import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { openDatabaseConnection } from '../database/connection.js';

export function ensureTrackedImportTarget(record: PreparedImportRecord, targetNodeId: string) {
  const connection = openDatabaseConnection();
  const existingSource = connection.driver.queryOne<{ source_fingerprint: string }>(
    'SELECT source_fingerprint FROM import_sources WHERE source_fingerprint = ?',
    [record.sourceFingerprint]
  );
  if (existingSource) {
    connection.driver.execute('UPDATE import_sources SET latest_node_id = ? WHERE source_fingerprint = ?', [
      targetNodeId,
      record.sourceFingerprint
    ]);
    recordImportSourceSync(connection.driver, record.sourceFingerprint, record.importedAt);
    return;
  }

  connection.driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.sourceFingerprint,
      record.provider,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.importedAt,
      record.importedAt,
      '',
      targetNodeId
    ]
  );
  recordImportSourceSync(connection.driver, record.sourceFingerprint, record.importedAt);
}
