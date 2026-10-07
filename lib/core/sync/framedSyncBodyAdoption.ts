import { hexToBytes } from '@noble/hashes/utils.js';

import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';
import { verifyAvailableBlobChunks } from '../database/framedSyncAvailableBlobVerification.js';

import { bodyIdentity } from './bodyContentVerification.js';
import { adoptVerifiedBody } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';
import { loadVerifiedBodyRef, verifyBodyContent } from './verifiedBody.js';

const AVAILABLE_BODY_SOURCES = ['framed_sync_available_blobs',
  'framed_android.framed_sync_android_available_blobs', 'framed_ios.framed_sync_ios_available_blobs'] as const;
export type FramedSyncAvailableBodySource = (typeof AVAILABLE_BODY_SOURCES)[number];
type Identity = Readonly<{ hash: string; byteLength: number }>;

async function copyChunk(db: DbPort, table: FramedSyncAvailableBodySource, identity: Identity, offset: number, size: number, storage: 'continuous' | 'chunked') {
  const sha256 = hexToBytes(identity.hash);
  const source = storage === 'continuous'
    ? { sql: `SELECT substr(data, ?, ?) FROM ${table} WHERE sha256 = ?`, params: [offset + 1, size, sha256] }
    : { sql: `SELECT data FROM ${table.replace(/_blobs$/u, '_blob_chunks')} WHERE sha256 = ? AND byte_offset = ?`, params: [sha256, offset] };
  const [existing] = await db.query<{ matches: number }>(`SELECT data = (${source.sql}) AS matches
    FROM content_body_chunks WHERE hash = ? AND byte_offset = ?`,
  [...source.params, identity.hash, offset]);
  if (existing) {
    if (existing.matches !== 1) throw new Error('body_chunk_identity_conflict');
    return;
  }
  await db.run(`INSERT INTO content_body_chunks (hash, byte_offset, data)
    SELECT ?, ?, (${source.sql})`,
  [identity.hash, offset, ...source.params]);
}

/** Host validates durable ready ownership and source length; caller owns the business transaction. */
export async function adoptFramedSyncAvailableBody(db: DbPort, source: FramedSyncAvailableBodySource,
  value: Identity, now: string, storage: 'continuous' | 'chunked' = 'continuous') {
  if (!AVAILABLE_BODY_SOURCES.includes(source)) throw new Error('framed_sync_body_source_invalid');
  const identity = bodyIdentity.parse(value);
  if (storage === 'chunked') {
    const scope = source.startsWith('framed_android.') ? 'android' : source.startsWith('framed_ios.') ? 'ios' : 'desktop';
    await verifyAvailableBlobChunks(db, scope, { sha256: hexToBytes(identity.hash), byteLength: BigInt(identity.byteLength) });
  }
  await db.run('INSERT OR IGNORE INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
    [identity.hash, identity.byteLength]);
  const [header] = await db.query<{ byte_length: number }>('SELECT byte_length FROM content_bodies WHERE hash = ?', [identity.hash]);
  if (header?.byte_length !== identity.byteLength) throw new Error('body_identity_conflict');
  for (let offset = 0; offset < identity.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    await copyChunk(db, source, identity, offset, Math.min(BODY_CONTENT_CHUNK_BYTES, identity.byteLength - offset), storage);
  }
  const existing = await loadVerifiedBodyRef(db, identity.hash);
  const ref = existing ?? await verifyBodyContent(db, identity);
  await adoptVerifiedBody(db, ref, now);
  return ref;
}
