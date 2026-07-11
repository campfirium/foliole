import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

const LATEST_APPLIED_IMPORT_RUN = `
  SELECT run.id
  FROM import_runs run
  WHERE run.node_id = nodes.id
    AND run.result_status <> 'failed'
    AND NOT (
      run.result_status = 'degraded'
      AND run.degraded_reason = 'empty_content'
    )
  ORDER BY run.imported_at DESC, run.id DESC
  LIMIT 1
`;

export function migrateNodeProvenance(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'nodes', 'import_source_fingerprint', 'TEXT');
  addColumnIfMissing(sqlite, 'nodes', 'import_content_fingerprint', 'TEXT');
  if (!tableExists(sqlite, 'nodes') || !tableExists(sqlite, 'import_runs')) return;

  sqlite.exec(`
    UPDATE nodes
    SET import_source_fingerprint = (
          SELECT run.source_fingerprint FROM import_runs run
          WHERE run.id = (${LATEST_APPLIED_IMPORT_RUN})
        ),
        import_content_fingerprint = (
          SELECT run.content_fingerprint FROM import_runs run
          WHERE run.id = (${LATEST_APPLIED_IMPORT_RUN})
        ),
        sync_dirty = 1
    WHERE import_source_fingerprint IS NULL
      AND import_content_fingerprint IS NULL
      AND EXISTS (${LATEST_APPLIED_IMPORT_RUN})
  `);
}
