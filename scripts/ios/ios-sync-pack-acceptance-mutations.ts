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
  try {
    sqlite.prepare(
      "UPDATE node_sync_versions SET parent_version_id = 'missing#ancestor' WHERE object_id = ?"
    ).run(objectId);
  } finally {
    sqlite.close();
  }
  const mutatedDatabase = await fs.readFile(temporaryPath);
  await fs.rm(temporaryPath, { force: true });
  const compressed = deflateSync(mutatedDatabase);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  manifest.database_uncompressed_sha256 = sha256Uri(mutatedDatabase);
  manifest.database_compressed_sha256 = sha256Uri(compressed);
  await writeStoredZip(outputPath, [
    { name: 'manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'incoming.db.deflate', content: compressed }
  ]);
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
