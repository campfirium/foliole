import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { inflateSync } from 'node:zlib';

import { SYNC_PACK_DATABASE_ENTRY, SYNC_PACK_FORMAT, SYNC_PACK_FORMAT_VERSION } from '../../lib/core/sync/syncPackEnvelopeContract.js';

export async function extractSyncPackDatabase(args: {
  body: Buffer;
  expectedPeerId: string;
  expectedSourcePeerId: string;
  outputPath: string;
}) {
  const entries = readStoredEntries(args.body);
  const manifest = JSON.parse(required(entries, 'manifest.json').toString('utf8')) as Record<string, unknown>;
  if (manifest.format !== SYNC_PACK_FORMAT || manifest.format_version !== SYNC_PACK_FORMAT_VERSION ||
      manifest.to_peer_id !== args.expectedPeerId ||
      manifest.from_device_id !== args.expectedSourcePeerId ||
      manifest.database_file !== SYNC_PACK_DATABASE_ENTRY) {
    throw new Error('invalid_sync_pack_manifest');
  }
  const compressed = required(entries, SYNC_PACK_DATABASE_ENTRY);
  if (sha(compressed) !== manifest.database_compressed_sha256) throw new Error('invalid_sync_pack_compressed_checksum');
  const database = inflateSync(compressed);
  if (sha(database) !== manifest.database_uncompressed_sha256) throw new Error('invalid_sync_pack_database_checksum');
  await fs.writeFile(args.outputPath, database);
  return {
    fromStateSeq: Number(manifest.from_state_seq),
    toStateSeq: Number(manifest.to_state_seq)
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
