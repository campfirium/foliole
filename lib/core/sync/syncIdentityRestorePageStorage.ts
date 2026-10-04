import type { DbPort } from './dbPort.js';
import { assertSyncIdentityPackInnerMatchesDatabase,
  type parseSyncIdentityPackContainerManifest } from './syncIdentityPackManifest.js';
import { PACK_SCHEMA } from './syncPackSchema.js';

type VerifiedManifest = ReturnType<typeof parseSyncIdentityPackContainerManifest>;
const TABLES = PACK_SCHEMA.map((sql) => sql.match(/CREATE TABLE (\w+)/u)![1]!);
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function pageIndex(index: number) {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('sync_identity_restore_page_invalid');
  }
  return index;
}

/** Copy one checksum-verified attached pack into a disposable attached snapshot. */
export async function stageSyncIdentityRestorePage(port: DbPort,
  index: number, manifest: VerifiedManifest) {
  pageIndex(index);
  if (manifest.identity_page.page_index !== index ||
      !manifest.identity_page.restore_id || !manifest.identity_page.restore_set_id) {
    throw new Error('sync_identity_restore_page_invalid');
  }
  await assertSyncIdentityPackInnerMatchesDatabase(port, manifest);
  for (const table of TABLES) {
    const stage = quote(`sync_identity_restore_${table}`);
    await port.run(`CREATE TABLE IF NOT EXISTS identity_view.${stage} AS
      SELECT CAST(0 AS INTEGER) AS page_index, * FROM inc.${quote(table)} WHERE 0`);
    await port.run(`DELETE FROM identity_view.${stage} WHERE page_index = ?`, [index]);
    await port.run(`INSERT INTO identity_view.${stage}
      SELECT ?, * FROM inc.${quote(table)}`, [index]);
  }
}

/** Refill one fixed `inc` from a staged page during the single live restore transaction. */
export async function loadSyncIdentityRestorePage(port: DbPort, index: number,
  manifest: VerifiedManifest) {
  pageIndex(index);
  if (manifest.identity_page.page_index !== index) {
    throw new Error('sync_identity_restore_page_invalid');
  }
  for (const table of TABLES) {
    const columns = await port.query<{ name: string }>(`PRAGMA inc.table_info(${quote(table)})`);
    if (columns.length === 0) throw new Error('sync_identity_restore_pack_schema_invalid');
    const names = columns.map((column) => quote(column.name)).join(', ');
    await port.run(`DELETE FROM inc.${quote(table)}`);
    await port.run(`INSERT INTO inc.${quote(table)} (${names}) SELECT ${names}
      FROM identity_view.${quote(`sync_identity_restore_${table}`)} WHERE page_index = ?`,
    [index]);
  }
  await assertSyncIdentityPackInnerMatchesDatabase(port, manifest);
}
