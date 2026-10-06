import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';
import { matchingTombstoneVersionSql } from '../sync/syncNodeTombstoneVersion.js';

import { framedSyncNodeInventorySql, framedSyncTombstoneSummarySql } from './framedSyncInventoryProjectionSql.js';
import { migrateCompanionFramedSyncTombstoneInventory, migrateFramedSyncTombstoneInventory } from './framedSyncTombstoneInventoryMigration.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const source = z.object({ version_id: z.string(), body_text: z.string() });
const SOURCE_SQL = `SELECT version.version_id, version.body_text FROM node_sync_versions version
  JOIN node_sync_tombstones tomb ON ${matchingTombstoneVersionSql('version', 'tomb')}
  WHERE version.version_id > ? ORDER BY version.version_id LIMIT 1`;
const UPDATE_SQL = 'UPDATE framed_sync_version_summary SET body_hash = ? WHERE version_id = ?';
const INVENTORY_SQL = framedSyncNodeInventorySql('SELECT node_id FROM node_sync_tombstones');
const bodyHash = (body: string) => bytesToHex(sha256(new TextEncoder().encode(body)));

export function migrateFramedSyncPermanentDeleteHistory(sqlite: DatabaseMigrationTarget) {
  migrateFramedSyncTombstoneInventory(sqlite);
  let after = '';
  for (;;) {
    const row = sqlite.prepare(SOURCE_SQL).all(after)[0];
    if (!row) break;
    const version = source.parse(row);
    sqlite.prepare(UPDATE_SQL).run(bodyHash(version.body_text), version.version_id);
    after = version.version_id;
  }
  sqlite.exec(framedSyncTombstoneSummarySql('1'));
  sqlite.exec(INVENTORY_SQL);
}

export async function migrateCompanionFramedSyncPermanentDeleteHistory(port: DbPort) {
  await migrateCompanionFramedSyncTombstoneInventory(port);
  let after = '';
  for (;;) {
    const rows = await port.query(SOURCE_SQL, [after]);
    if (!rows.length) break;
    const version = source.parse(rows[0]);
    await port.run(UPDATE_SQL, [bodyHash(version.body_text), version.version_id]);
    after = version.version_id;
  }
  await port.run(framedSyncTombstoneSummarySql('1'));
  for (const sql of INVENTORY_SQL.split(';').filter((sql) => sql.trim())) await port.run(sql);
}
