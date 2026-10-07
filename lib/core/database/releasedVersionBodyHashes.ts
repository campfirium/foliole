import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../sync/dbPort.js';

import { BODY_CONTENT_CHUNK_BYTES } from './bodyContentSchema.js';
import type { DatabaseDriver } from './driver.js';

const SNAPSHOT_BODY = "CASE WHEN json_type(snapshot_json, '$.content') = 'text' THEN json_extract(snapshot_json, '$.content') END";
const DESCRIPTOR_SQL = `SELECT length(CAST(body_text AS BLOB)) AS body_length,
  length(CAST(${SNAPSHOT_BODY} AS BLOB)) AS snapshot_length,
  json_extract(snapshot_json, '$.body_blob_hash') AS body_hash,
  json_type(snapshot_json, '$.text_alternatives') AS alternative_type
  FROM node_sync_versions WHERE version_id = ?`;
const ALTERNATIVES_SQL = `SELECT json_extract(alternative.value, '$.body_blob_hash') AS hash
  FROM node_sync_versions version, json_each(version.snapshot_json, '$.text_alternatives') alternative
  WHERE version.version_id = ? ORDER BY alternative.key`;
type Descriptor = { body_length: number | null; snapshot_length: number | null;
  body_hash: string | null; alternative_type: string | null };
type Source = 'body' | 'snapshot';

function rangeSql(source: Source) {
  return `SELECT substr(CAST(${source === 'body' ? 'body_text' : SNAPSHOT_BODY} AS BLOB), ?, ?) AS data
    FROM node_sync_versions WHERE version_id = ?`;
}

function checkedBytes(row: { data: Uint8Array } | undefined, length: number) {
  if (!row || !(row.data instanceof Uint8Array) || row.data.byteLength !== length) {
    throw new Error('released_version_body_unavailable');
  }
  return row.data;
}

function sources(row: Descriptor) {
  if (row.alternative_type !== null && row.alternative_type !== 'null' && row.alternative_type !== 'array') {
    throw new Error('released_version_alternatives_invalid');
  }
  return [['body', row.body_length], ['snapshot', row.snapshot_length]] as const;
}

/** Discover release candidates before stripping the version, without returning historical text. */
export function releasedVersionBodyHashesWithDriver(driver: DatabaseDriver, versionId: string) {
  const row = driver.queryOne<Descriptor>(DESCRIPTOR_SQL, [versionId]);
  if (!row) return [];
  const hashes = new Set<string>();
  let snapshotHash: string | null = null;
  for (const [source, size] of sources(row)) {
    if (size === null) continue;
    const digest = sha256.create();
    try {
      for (let offset = 0; offset < size; offset += BODY_CONTENT_CHUNK_BYTES) {
        const length = Math.min(BODY_CONTENT_CHUNK_BYTES, size - offset);
        digest.update(checkedBytes(driver.queryOne<{ data: Uint8Array }>(rangeSql(source),
          [offset + 1, length, versionId]), length));
      }
      const hash = bytesToHex(digest.digest());
      if (source === 'body') hashes.add(hash);
      else snapshotHash = hash;
    } finally { digest.destroy(); }
  }
  for (const alternative of driver.queryAll<{ hash: string }>(ALTERNATIVES_SQL, [versionId])) hashes.add(alternative.hash);
  if (row.body_hash) hashes.add(row.body_hash);
  if (snapshotHash !== null) hashes.add(snapshotHash);
  return [...hashes];
}

export async function releasedVersionBodyHashesWithPort(port: DbPort, versionId: string) {
  const [row] = await port.query<Descriptor>(DESCRIPTOR_SQL, [versionId]);
  if (!row) return [];
  const hashes = new Set<string>();
  let snapshotHash: string | null = null;
  for (const [source, size] of sources(row)) {
    if (size === null) continue;
    const digest = sha256.create();
    try {
      for (let offset = 0; offset < size; offset += BODY_CONTENT_CHUNK_BYTES) {
        const length = Math.min(BODY_CONTENT_CHUNK_BYTES, size - offset);
        const [chunk] = await port.query<{ data: Uint8Array }>(rangeSql(source), [offset + 1, length, versionId]);
        digest.update(checkedBytes(chunk, length));
      }
      const hash = bytesToHex(digest.digest());
      if (source === 'body') hashes.add(hash);
      else snapshotHash = hash;
    } finally { digest.destroy(); }
  }
  for (const alternative of await port.query<{ hash: string }>(ALTERNATIVES_SQL, [versionId])) hashes.add(alternative.hash);
  if (row.body_hash) hashes.add(row.body_hash);
  if (snapshotHash !== null) hashes.add(snapshotHash);
  return [...hashes];
}
