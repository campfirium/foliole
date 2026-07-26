import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';

import { writeStoredZip } from '../../electron/diagnostics/zipStore.ts';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export async function writeLegacyFormatPack(sourcePath: string, outputPath: string) {
  const entries = readStoredZipEntries(await fs.readFile(sourcePath));
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  manifest.format_version = 1;
  await writeStoredZip(outputPath, [
    { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'incoming.db.deflate', content: requiredEntry(entries, 'incoming.db.deflate') }
  ]);
}

export async function writeIllegalDagPack(
  sourcePath: string,
  outputPath: string,
  objectId = 'ios-acceptance-restore'
) {
  const entries = readStoredZipEntries(await fs.readFile(sourcePath));
  const database = inflateSync(requiredEntry(entries, 'incoming.db.deflate'));
  const temporaryPath = `${outputPath}.db`;
  await fs.writeFile(temporaryPath, database);
  const sqlite = new BetterSqlite3(temporaryPath);
  let versionParentsRowCount = 0;
  try {
    const versions = sqlite.prepare<{ objectId: string }, { version_id: string }>(
      'SELECT version_id FROM node_sync_versions WHERE object_id = @objectId'
    ).all({ objectId });
    for (const { version_id: versionId } of versions) {
      sqlite.prepare(
        "UPDATE node_sync_versions SET parent_version_id = 'missing#ancestor' WHERE version_id = ?"
      ).run(versionId);
      sqlite.prepare('DELETE FROM node_sync_version_parents WHERE version_id = ? AND ordinal = 0').run(versionId);
      sqlite.prepare(
        `INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
         VALUES (?, 'missing#ancestor', 0)`
      ).run(versionId);
    }
    updateInnerTableRowCount(sqlite, 'node_sync_version_parents');
    versionParentsRowCount = countSqliteRows(sqlite, 'node_sync_version_parents');
  } finally {
    sqlite.close();
  }
  const mutatedDatabase = await fs.readFile(temporaryPath);
  await fs.rm(temporaryPath, { force: true });
  const compressed = deflateSync(mutatedDatabase);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  manifest.database_uncompressed_sha256 = sha256Uri(mutatedDatabase);
  manifest.database_compressed_sha256 = sha256Uri(compressed);
  updateManifestTableRowCount(manifest, 'node_sync_version_parents', versionParentsRowCount);
  await writeStoredZip(outputPath, [
    { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'incoming.db.deflate', content: compressed }
  ]);
}

function updateInnerTableRowCount(sqlite: import('better-sqlite3').Database, tableName: string) {
  const row = sqlite.prepare<{ key: string }, { value: string }>(
    'SELECT value FROM pack_manifest WHERE key = @key'
  ).get({ key: 'manifest_json' });
  const manifest = JSON.parse(row?.value ?? '{}');
  updateManifestTableRowCount(manifest, tableName, countSqliteRows(sqlite, tableName));
  sqlite.prepare('UPDATE pack_manifest SET value = ? WHERE key = ?').run(JSON.stringify(manifest), 'manifest_json');
}

function countSqliteRows(sqlite: import('better-sqlite3').Database, tableName: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tableName)) throw new Error(`invalid_table_name:${tableName}`);
  return sqlite.prepare<{ count: number }>(`SELECT COUNT(*) AS count FROM "${tableName}"`).get()?.count ?? 0;
}

function updateManifestTableRowCount(manifest: { tables?: Array<{ name?: string; row_count?: number }> }, tableName: string, rowCount: number) {
  const table = manifest.tables?.find((entry) => entry.name === tableName);
  if (!table) throw new Error(`missing_manifest_table:${tableName}`);
  table.row_count = rowCount;
}

function sha256Uri(value: Buffer) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function requiredEntry(entries: Map<string, Buffer>, name: string) {
  const value = entries.get(name);
  if (!value) throw new Error(`missing_sync_pack_entry:${name}`);
  return value;
}

function readStoredZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entries.set(name, buffer.subarray(contentStart, contentStart + size));
    offset = contentStart + size;
  }
  return entries;
}
