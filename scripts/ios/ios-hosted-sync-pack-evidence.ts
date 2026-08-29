import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface HostedPackManifest {
  database_compressed_sha256: string;
  database_uncompressed_sha256: string;
  from_peer_id: string;
  from_state_seq: number;
  pack_id: string;
  tables: Array<{ name: string; row_count: number }>;
  to_peer_id: string;
  to_state_seq: number;
}

export function readHostedPack(filePath: string) {
  const bytes = readFileSync(filePath);
  const entries = readStoredEntries(bytes);
  const compressed = requiredEntry(entries, 'incoming.db.deflate');
  const database = inflateSync(compressed);
  const manifest = JSON.parse(requiredEntry(entries, 'manifest.json').toString('utf8')) as HostedPackManifest;
  return {
    bytes,
    compressed,
    database,
    manifest,
    packSha256: sha256(bytes)
  };
}

export function packEvidence(args: {
  attempt: string;
  oracleSemanticDigest: string;
  packPath: string;
  scenario: string;
  sourceLocator: string;
}) {
  const pack = readHostedPack(args.packPath);
  const compressedSha256 = sha256Uri(pack.compressed);
  const uncompressedSha256 = sha256Uri(pack.database);
  if (pack.manifest.database_compressed_sha256 !== compressedSha256 ||
      pack.manifest.database_uncompressed_sha256 !== uncompressedSha256) {
    throw new Error('ios_hosted_sync_pack_hash_mismatch');
  }
  return {
    attempt: args.attempt,
    compressed_sha256: compressedSha256,
    from_state_seq: pack.manifest.from_state_seq,
    oracle_semantic_digest: args.oracleSemanticDigest,
    outer_pack_sha256: pack.packSha256,
    pack_id: pack.manifest.pack_id,
    row_counts: Object.fromEntries(pack.manifest.tables.map((row) => [row.name, row.row_count])),
    scenario: args.scenario,
    source_locator: args.sourceLocator,
    source_peer_id: pack.manifest.from_peer_id,
    target_peer_id: pack.manifest.to_peer_id,
    to_state_seq: pack.manifest.to_state_seq,
    uncompressed_sha256: uncompressedSha256
  };
}

function readStoredEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.set(name, buffer.subarray(contentStart, contentStart + compressedSize));
    offset = contentStart + compressedSize;
  }
  return entries;
}

function requiredEntry(entries: Map<string, Buffer>, name: string) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`ios_hosted_sync_pack_entry_missing:${name}`);
  return entry;
}

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Uri(bytes: Buffer) {
  return `sha256:${sha256(bytes)}`;
}
