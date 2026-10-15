import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { collectAllNodeVersionChains } from './dynamicNodeVersionChainMigration.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { collectAllNodeVersionChainsWithDriver } from './nodeVersionChainRetention.js';

/** The normal schema transaction owns both payload retirement and its inventory triggers. */
export function migrateTopicHistoryRetirement(sqlite: DatabaseMigrationTarget) {
  const driver: DatabaseDriver = {
    queryAll: <T extends DatabaseRow>(sql: string, params = []) => sqlite.prepare(sql).all(...params) as T[],
    queryOne: <T extends DatabaseRow>(sql: string, params = []) => sqlite.prepare(sql).all(...params)[0] as T | undefined,
    execute(sql, params = []) {
      const result = z.object({ changes: z.number(), lastInsertRowid: z.union([z.number(), z.bigint()]) })
        .parse(sqlite.prepare(sql).run(...params));
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    transaction: execute => sqlite.transaction(() => execute(driver))(),
    prepare: sql => ({ sql,
      run: params => driver.execute(sql, params),
      get: params => driver.queryOne(sql, params),
      all: params => driver.queryAll(sql, params) })
  };
  collectAllNodeVersionChainsWithDriver(driver);
}

export function migrateCompanionTopicHistoryRetirement(db: DbPort) {
  return collectAllNodeVersionChains(db);
}
