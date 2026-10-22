import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { collectAllNodeVersionChains } from './dynamicNodeVersionChainMigration.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { retireNodeVersionChainWithDriver } from './nodeVersionChainRetention.js';
import { framedSyncNodeInventorySql, framedSyncVersionSummarySql } from './preNodeChildInventoryProjectionSql.js';

const VERSION_INVENTORY_TRIGGERS_SQL = `SELECT name, sql FROM sqlite_master WHERE type = 'trigger'
  AND tbl_name = 'node_sync_versions' AND name LIKE 'trg_framed_inventory_%'`;

function migrationDriver(sqlite: DatabaseMigrationTarget): DatabaseDriver {
  const statements = new Map<string, ReturnType<DatabaseMigrationTarget['prepare']>>();
  const prepare = (sql: string) => statements.get(sql) ?? statements.set(sql, sqlite.prepare(sql)).get(sql)!;
  const driver: DatabaseDriver = {
    queryAll: <T extends DatabaseRow>(sql: string, params = []) => prepare(sql).all(...params) as T[],
    queryOne: <T extends DatabaseRow>(sql: string, params = []) => prepare(sql).all(...params)[0] as T | undefined,
    execute(sql, params = []) {
      const result = z.object({ changes: z.number(), lastInsertRowid: z.union([z.number(), z.bigint()]) })
        .parse(prepare(sql).run(...params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    transaction: execute => sqlite.transaction(() => execute(driver))(),
    prepare: sql => ({ sql,
      run: params => driver.execute(sql, params),
      get: params => driver.queryOne(sql, params),
      all: params => driver.queryAll(sql, params) })
  };
  return driver;
}

/**
 * The schema transaction retires topic history once, with version inventory triggers suspended so
 * each node is projected once instead of once per retired version. Released blobs are left for
 * ordinary collection after startup; an unreferenced blob is never advertised to peers.
 */
export function migrateTopicHistoryRetirement(sqlite: DatabaseMigrationTarget) {
  const triggers = sqlite.prepare(VERSION_INVENTORY_TRIGGERS_SQL).all() as Array<{ name: string; sql: string }>;
  for (const { name } of triggers) sqlite.exec(`DROP TRIGGER ${name}`);
  const driver = migrationDriver(sqlite);
  const nodes = driver.queryAll<{ id: string }>(
    'SELECT id FROM nodes WHERE current_version_id IS NOT NULL UNION SELECT node_id AS id FROM node_sync_tombstones');
  sqlite.exec('CREATE TEMP TABLE topic_history_retired (version_id TEXT PRIMARY KEY)');
  for (const node of nodes) {
    for (const id of retireNodeVersionChainWithDriver(driver, node.id).removed) {
      driver.execute('INSERT OR IGNORE INTO temp.topic_history_retired (version_id) VALUES (?)', [id]);
    }
  }
  for (const { sql } of triggers) sqlite.exec(sql);
  sqlite.exec(framedSyncVersionSummarySql('version.version_id IN (SELECT version_id FROM temp.topic_history_retired)'));
  sqlite.exec(framedSyncNodeInventorySql(`SELECT DISTINCT object_id FROM node_sync_versions
    WHERE version_id IN (SELECT version_id FROM temp.topic_history_retired)`));
  sqlite.exec('DROP TABLE temp.topic_history_retired');
}

export function migrateCompanionTopicHistoryRetirement(db: DbPort) {
  return collectAllNodeVersionChains(db);
}
