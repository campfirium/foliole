import type { DbPort } from '../sync/dbPort.js';
import { CHAIN_VERSION_METADATA_SQL } from '../sync/nodeVersionChainMetadata.js';
import { planNodeVersionMetadataChain, type ChainEdge, type ChainVersionMetadata } from '../sync/nodeVersionChainPlan.js';
import { CHAIN_EDGES_SQL, chainMutationStatements, chainReferencesQuery } from '../sync/nodeVersionChainSql.js';
import { collectNodeVersionPayloads } from '../sync/nodeVersionPayloadCollector.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_VERSION_MEMBER_POSITION_SCHEMA } from './nodeVersionMemberPositionSchema.js';

const BACKFILL_LOCAL_ORIGINS_SQL = `INSERT OR IGNORE INTO node_version_local_origins (version_id)
  SELECT version.version_id FROM node_sync_versions version
  WHERE version.host_name IN (SELECT json_extract(value, '$') FROM settings WHERE key = 'host_name')`;

/** Runs once at the schema boundary; ordinary saves use the same planner thereafter. */
export function migrateDynamicNodeVersionChains(sqlite: DatabaseMigrationTarget) {
  // The current retention query needs this table before its later numbered migration.
  for (const statement of NODE_VERSION_MEMBER_POSITION_SCHEMA) sqlite.exec(statement);
  sqlite.exec(BACKFILL_LOCAL_ORIGINS_SQL);
  sqlite.exec('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  const nodes = sqlite.prepare('SELECT id, current_version_id FROM nodes WHERE current_version_id IS NOT NULL AND sync_dirty = 0')
    .all() as Array<{ id: string; current_version_id: string }>;
  for (const node of nodes) {
    const query = chainReferencesQuery(node.id, true);
    const refs = sqlite.prepare(query.sql).all(...query.params) as Array<{ version_id: string | null; frozen: number }>;
    const keep = new Set([node.current_version_id, ...refs.flatMap((ref) => ref.version_id ? [ref.version_id] : [])]);
    const frozen = new Set(refs.filter((ref) => ref.frozen && ref.version_id).map((ref) => ref.version_id!));
    const plan = planNodeVersionMetadataChain(sqlite.prepare(CHAIN_VERSION_METADATA_SQL).all(node.id) as ChainVersionMetadata[],
      sqlite.prepare(CHAIN_EDGES_SQL).all(node.id) as ChainEdge[], keep, frozen, Number.MAX_SAFE_INTEGER, new Set([node.current_version_id]));
    for (const statement of chainMutationStatements(plan)) sqlite.prepare(statement.sql).run(...statement.params);
  }
}

export async function migrateCompanionDynamicNodeVersionChains(db: DbPort) {
  await db.run(`INSERT OR IGNORE INTO node_version_local_origins (version_id)
    SELECT version.version_id FROM node_sync_versions version
    WHERE version.host_name IN (SELECT value FROM companion_meta WHERE key = 'host_name')`);
  await db.run('UPDATE node_version_local_proof_state SET proof_revision = proof_revision + 1 WHERE singleton_id = 1');
  await collectAllNodeVersionChains(db, true);
}

export async function collectAllNodeVersionChains(db: DbPort, retireLegacyHistory = false) {
  const nodes = await db.query<{ id: string }>('SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones');
  for (const node of nodes) await collectNodeVersionPayloads(db, node.id, Number.MAX_SAFE_INTEGER, retireLegacyHistory);
}
