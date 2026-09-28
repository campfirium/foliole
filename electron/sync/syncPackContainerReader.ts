import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, createInflate, inflateSync } from 'node:zlib';

import {
  assertSyncPackSchemaVersion,
  SYNC_PACK_DATABASE_ENTRY,
  SYNC_PACK_FORMAT,
  SYNC_PACK_FORMAT_VERSION
} from '../../lib/core/sync/syncPackEnvelopeContract.js';
import { parseSyncPackManifest } from '../../lib/core/sync/syncPackManifestValidation.js';

export async function extractSyncPackDatabase(args: {
  body: Buffer;
  expectedPeerId: string;
  expectedSourcePeerId: string;
  outputPath: string;
}) {
  const entries = readStoredEntries(args.body);
  const manifest = JSON.parse(required(entries, 'manifest.json').toString('utf8')) as Record<string, unknown>;
  const verifiedManifest = validateManifest(manifest, args);
  const compressed = required(entries, SYNC_PACK_DATABASE_ENTRY);
  if (sha(compressed) !== manifest.database_compressed_sha256) throw new Error('invalid_sync_pack_compressed_checksum');
  const database = inflateSync(compressed);
  if (sha(database) !== manifest.database_uncompressed_sha256) throw new Error('invalid_sync_pack_database_checksum');
  await fs.writeFile(args.outputPath, database);
  return {
    ...verifiedManifest
  };
}

export async function extractSyncPackDatabaseFromFile(args: {
  archivePath: string;
  expectedPeerId: string;
  expectedSourcePeerId: string;
  maxDatabaseBytes?: number;
  outputPath: string;
}) {
  const archive = await fs.open(args.archivePath, 'r');
  try {
    const archiveSize = (await archive.stat()).size;
    const manifestEntry = await readStoredEntry(archive, 0, archiveSize);
    if (manifestEntry.name !== 'manifest.json' || manifestEntry.size > 256 * 1024) {
      throw new Error('invalid_sync_pack_manifest');
    }
    const manifestBytes = await readExact(archive, manifestEntry.bodyStart, manifestEntry.size);
    if (crc32(manifestBytes) !== manifestEntry.checksum) throw new Error('invalid_sync_pack_manifest');
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>;
    const verifiedManifest = validateManifest(manifest, args);
    const databaseEntry = await readStoredEntry(archive, manifestEntry.bodyEnd, archiveSize);
    if (databaseEntry.name !== SYNC_PACK_DATABASE_ENTRY) {
      throw new Error(`missing_sync_pack_entry:${SYNC_PACK_DATABASE_ENTRY}`);
    }
    const compressed = checksumStream(databaseEntry.size);
    const raw = checksumStream(args.maxDatabaseBytes ?? Number.MAX_SAFE_INTEGER);
    const temporaryPath = `${args.outputPath}.unverified`;
    try {
      await pipeline(
        createReadStream(args.archivePath, {
          start: databaseEntry.bodyStart, end: databaseEntry.bodyEnd - 1,
          highWaterMark: 64 * 1024
        }),
        compressed.stream,
        createInflate(),
        raw.stream,
        createWriteStream(temporaryPath)
      );
      if (compressed.result().checksum !== databaseEntry.checksum ||
          compressed.result().sha256 !== manifest.database_compressed_sha256) {
        throw new Error('invalid_sync_pack_compressed_checksum');
      }
      if (raw.result().sha256 !== manifest.database_uncompressed_sha256) {
        throw new Error('invalid_sync_pack_database_checksum');
      }
      await fs.rename(temporaryPath, args.outputPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
    return verifiedManifest;
  } finally {
    await archive.close();
  }
}

function validateManifest(
  manifest: Record<string, unknown>,
  args: { expectedPeerId: string; expectedSourcePeerId: string }
) {
  if (manifest.format !== SYNC_PACK_FORMAT || manifest.format_version !== SYNC_PACK_FORMAT_VERSION ||
      manifest.to_peer_id !== args.expectedPeerId ||
      manifest.from_peer_id !== args.expectedSourcePeerId ||
      manifest.database_file !== SYNC_PACK_DATABASE_ENTRY) {
    throw new Error('invalid_sync_pack_manifest');
  }
  assertSyncPackSchemaVersion(manifest.schema_version);
  return parseSyncPackManifest(manifest);
}

async function readStoredEntry(
  file: Awaited<ReturnType<typeof fs.open>>, offset: number, archiveSize: number
) {
  const header = await readExact(file, offset, 30);
  if (header.readUInt32LE(0) !== 0x04034b50 || header.readUInt16LE(6) !== 0 ||
      header.readUInt16LE(8) !== 0) throw new Error('invalid_sync_pack_zip_entry');
  const size = header.readUInt32LE(18);
  if (size !== header.readUInt32LE(22)) throw new Error('invalid_sync_pack_zip_entry');
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  if (nameLength < 1 || nameLength > 128 || extraLength > 1024) {
    throw new Error('invalid_sync_pack_zip_entry');
  }
  const bodyStart = offset + 30 + nameLength + extraLength;
  const bodyEnd = bodyStart + size;
  if (bodyEnd > archiveSize) throw new Error('invalid_sync_pack_zip_entry');
  const name = (await readExact(file, offset + 30, nameLength)).toString('utf8');
  return { bodyEnd, bodyStart, checksum: header.readUInt32LE(14), name, size };
}

async function readExact(file: Awaited<ReturnType<typeof fs.open>>, offset: number, length: number) {
  const value = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const result = await file.read(value, read, length - read, offset + read);
    if (result.bytesRead === 0) throw new Error('invalid_sync_pack_zip_entry');
    read += result.bytesRead;
  }
  return value;
}

function checksumStream(maxBytes: number) {
  const hash = createHash('sha256');
  let checksum = 0;
  let bytes = 0;
  return {
    stream: new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        if (bytes > maxBytes) return done(new Error('sync_pack_database_limit_exceeded'));
        hash.update(chunk);
        checksum = crc32(chunk, checksum);
        done(null, chunk);
      }
    }),
    result: () => ({ checksum, sha256: `sha256:${hash.copy().digest('hex')}` })
  };
}

function readStoredEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if (method !== 0) throw new Error('unsupported_sync_pack_zip_compression');
    const nameStart = offset + 30;
    const bodyStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    entries.set(name, buffer.subarray(bodyStart, bodyStart + size));
    offset = bodyStart + size;
  }
  return entries;
}

function required(entries: Map<string, Buffer>, name: string) {
  const value = entries.get(name);
  if (!value) throw new Error(`missing_sync_pack_entry:${name}`);
  return value;
}

function sha(value: Buffer) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
