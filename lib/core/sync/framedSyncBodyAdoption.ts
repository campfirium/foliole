import { hexToBytes } from '@noble/hashes/utils.js';

import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import { bodyIdentity } from './bodyContentVerification.js';
import { adoptVerifiedBody } from './bodyContentWrite.js';
import type { DbPort } from './dbPort.js';
import { loadVerifiedBodyRef, verifyBodyContent } from './verifiedBody.js';

const AVAILABLE_BODY_SOURCES = ['framed_sync_available_blobs',
  'framed_android.framed_sync_android_available_blobs', 'framed_ios.framed_sync_ios_available_blobs'] as const;
export type FramedSyncAvailableBodySource = (typeof AVAILABLE_BODY_SOURCES)[number];
type Identity = Readonly<{ hash: string; byteLength: number }>;

async function copyChunk(db: DbPort, table: FramedSyncAvailableBodySource, identity: Identity, offset: number, size: number) {
  const sha256 = hexToBytes(identity.hash);
  const [existing] = await db.query<{ matches: number }>(`SELECT data = (
    SELECT substr(data, ?, ?) FROM ${table} WHERE sha256 = ?) AS matches
    FROM content_body_chunks WHERE hash = ? AND byte_offset = ?`,
  [offset + 1, size, sha256, identity.hash, offset]);
  if (existing) {
    if (existing.matches !== 1) throw new Error('body_chunk_identity_conflict');
    return;
  }
  await db.run(`INSERT INTO content_body_chunks (hash, byte_offset, data)
    SELECT ?, ?, substr(data, ?, ?) FROM ${table} WHERE sha256 = ?`,
  [identity.hash, offset, offset + 1, size, sha256]);
}

/** Host validates durable ready ownership and source length; caller owns the business transaction. */
export async function adoptFramedSyncAvailableBody(db: DbPort, source: FramedSyncAvailableBodySource,
  value: Identity, now: string) {
  if (!AVAILABLE_BODY_SOURCES.includes(source)) throw new Error('framed_sync_body_source_invalid');
  const identity = bodyIdentity.parse(value);
  await db.run('INSERT OR IGNORE INTO content_bodies (hash, byte_length, verified) VALUES (?, ?, 0)',
    [identity.hash, identity.byteLength]);
  const [header] = await db.query<{ byte_length: number }>('SELECT byte_length FROM content_bodies WHERE hash = ?', [identity.hash]);
  if (header?.byte_length !== identity.byteLength) throw new Error('body_identity_conflict');
  for (let offset = 0; offset < identity.byteLength; offset += BODY_CONTENT_CHUNK_BYTES) {
    await copyChunk(db, source, identity, offset, Math.min(BODY_CONTENT_CHUNK_BYTES, identity.byteLength - offset));
  }
  const existing = await loadVerifiedBodyRef(db, identity.hash);
  const ref = existing ?? await verifyBodyContent(db, identity);
  await adoptVerifiedBody(db, ref, now);
  return ref;
}
