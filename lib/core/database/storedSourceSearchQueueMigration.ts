import type { DbPort } from '../sync/dbPort.js';

import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';
import { STORED_SOURCE_INVALIDATION_TYPES, storedSourceEnqueueTriggerSql } from './storedSourceSearchInvalidations.js';

const SOURCES = [
  { table: 'external_documents', type: 'stored_source_external', key: 'ROW.document_id' },
  { table: 'keep_import_items', type: 'stored_source_removed', key: "ROW.rule_id || ':' || ROW.source_path" },
  { table: 'keep_import_item_cache', type: 'stored_source_removed', key: "ROW.rule_id || ':' || ROW.source_path" }
] as const;
const EVENTS = ['INSERT', 'UPDATE', 'DELETE'] as const;
const QUEUE_COLUMNS = 'id, invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at';

/** Unregistered desktop upgrade candidate. Caller owns the complete schema/trigger transaction. */
export async function migrateStoredSourceSearchQueue(db: DbPort) {
  await db.run('DROP INDEX idx_search_index_invalidations_pending');
  await db.run('DROP INDEX idx_search_index_invalidations_claim');
  await db.run('ALTER TABLE search_index_invalidations RENAME TO search_index_invalidations_stored_source_upgrade');
  const extraTypes = STORED_SOURCE_INVALIDATION_TYPES.map((type) => `'${type}',`).join('\n');
  for (const sql of SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS) {
    await db.run(sql.replace("'node_workspace',", `${extraTypes}\n'node_workspace',`));
  }
  await db.run(`INSERT INTO search_index_invalidations (${QUEUE_COLUMNS})
    SELECT ${QUEUE_COLUMNS} FROM search_index_invalidations_stored_source_upgrade`);
  await preserveQueueSequence(db);
  await db.run('DROP TABLE search_index_invalidations_stored_source_upgrade');
  for (const source of SOURCES) for (const event of EVENTS) {
    const name = `stored_search_${source.table}_${event.toLowerCase()}`;
    await db.run(`DROP TRIGGER ${name}`);
    const previous = event === 'INSERT' ? '' : storedSourceEnqueueTriggerSql(source.type, source.key.replaceAll('ROW.', 'old.'));
    const next = event === 'DELETE' ? '' : storedSourceEnqueueTriggerSql(source.type, source.key.replaceAll('ROW.', 'new.'));
    await db.run(`CREATE TRIGGER ${name} AFTER ${event} ON ${source.table} BEGIN ${previous} ${next} END`);
  }
}

async function preserveQueueSequence(db: DbPort) {
  await db.run(`INSERT INTO sqlite_sequence (name, seq)
    SELECT 'search_index_invalidations', seq FROM sqlite_sequence
    WHERE name = 'search_index_invalidations_stored_source_upgrade'
      AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'search_index_invalidations')`);
  await db.run(`UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE(
    (SELECT seq FROM sqlite_sequence WHERE name = 'search_index_invalidations_stored_source_upgrade'), 0))
    WHERE name = 'search_index_invalidations'`);
}
