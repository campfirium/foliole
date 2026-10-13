import type { DbPort } from '../sync/dbPort.js';
import { collectNodeVersionPayloads } from '../sync/nodeVersionPayloadCollector.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';

const BACKFILL_LOCAL_ORIGINS_SQL = `INSERT OR IGNORE INTO node_version_local_origins (version_id)
  SELECT version.version_id FROM node_sync_versions version
  WHERE version.host_name IN (SELECT json_extract(value, '$') FROM settings WHERE key = 'host_name')`;

/** Preserve historical bodies during upgrade; ordinary collection uses current member positions. */
export function migrateDynamicNodeVersionChains(sqlite: DatabaseMigrationTarget) {
  for (const statement of NODE_VERSION_MEMBER_POSITION_SCHEMA) sqlite.exec(statement);
  sqlite.exec(BACKFILL_LOCAL_ORIGINS_SQL);
  sqlite.exec('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
}

export async function migrateCompanionDynamicNodeVersionChains(db: DbPort) {
  await db.run(`INSERT OR IGNORE INTO node_version_local_origins (version_id)
    SELECT version.version_id FROM node_sync_versions version
    WHERE version.host_name IN (SELECT value FROM companion_meta WHERE key = 'host_name')`);
  await db.run('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
}

export async function collectAllNodeVersionChains(db: DbPort) {
  const nodes = await db.query<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones');
  for (const node of nodes) await collectNodeVersionPayloads(db, node.id, Number.MAX_SAFE_INTEGER);
}
