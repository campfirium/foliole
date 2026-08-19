import type { DbPort, DbRow } from '../sync/dbPort.js';

export async function migrateCompanionHostPermanentState(db: DbPort) {
  if (await tableExists(db, 'node_reading_device_state') && !await tableExists(db, 'node_reading_host_state')) {
    await db.run('ALTER TABLE node_reading_device_state RENAME TO node_reading_host_state');
  }
  await renameColumn(db, 'node_reading_host_state', 'device_id', 'host_name');
  await renameColumn(db, 'node_view_state', 'device_id', 'host_name');
  await renameColumn(db, 'setting_records', 'device_id', 'host_name');
  if (await tableExists(db, 'setting_records')) {
    await db.run("UPDATE setting_records SET scope = 'host' WHERE scope = 'device'");
    await db.run('DROP INDEX IF EXISTS idx_setting_records_device');
    await db.run('CREATE INDEX IF NOT EXISTS idx_setting_records_host ON setting_records (host_name, updated_at)');
  }
}

async function renameColumn(db: DbPort, table: string, from: string, to: string) {
  if (await columnExists(db, table, from) && !await columnExists(db, table, to)) {
    await db.run(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
  }
}

async function tableExists(db: DbPort, table: string) {
  const rows = await db.query(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", [table]
  );
  return rows.length > 0;
}

async function columnExists(db: DbPort, table: string, column: string) {
  if (!await tableExists(db, table)) return false;
  const rows = await db.query<DbRow>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}
