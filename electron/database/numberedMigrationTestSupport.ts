import { FRAMED_SYNC_INVENTORY_TRIGGERS } from '../../lib/core/database/framedSyncInventorySchema.js';
import { applyNumberedSchemaMigrations } from '../../lib/core/database/numberedMigrations.js';
import { FRAMED_SYNC_INVENTORY_TRIGGERS as historicalInventoryTriggers } from '../../lib/core/database/preNodeChildInventorySchema.js';

import type { SqliteDatabase } from './connection.js';

export function migrateNumberedFixtureTo(sqlite: SqliteDatabase, targetVersion: number) {
  const currentVersion = sqlite.pragma('user_version', { simple: true }) as number;
  sqlite.transaction(() => {
    applyNumberedSchemaMigrations({
      currentVersion,
      legacyMessage: 'numbered migration fixture is older than the supported baseline',
      setUserVersion: (version) => sqlite.pragma(`user_version = ${version}`),
      sqlite,
      targetVersion
    });
  })();
}

export function restorePreCurrentParentOrderFixture(sqlite: SqliteDatabase) {
  for (const sql of FRAMED_SYNC_INVENTORY_TRIGGERS) {
    const name = /^CREATE TRIGGER IF NOT EXISTS (\w+)/u.exec(sql)?.[1];
    if (!name) throw new Error('inventory_fixture_trigger_invalid');
    sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  }
  for (const sql of historicalInventoryTriggers) sqlite.exec(sql);
  sqlite.exec(`DROP TRIGGER trg_parent_order_node_insert;
    DROP TRIGGER trg_parent_order_node_update;
    DROP TRIGGER trg_parent_order_node_delete;
    DROP TABLE parent_order_sources;
    DROP TABLE parent_order_writer;
    DROP TABLE parent_order_projection_pending;`);
}
