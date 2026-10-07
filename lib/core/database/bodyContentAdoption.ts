import type { VerifiedBodyRef } from '../sync/verifiedBody.js';

export interface BodyManifest extends Record<string, unknown> {
  original_sha256: string;
  stored_sha256: string;
  original_size_bytes: number;
  stored_size_bytes: number;
  compression: string;
}

export const BODY_MANIFEST_SQL = `SELECT original_sha256, stored_sha256,
  original_size_bytes, stored_size_bytes, compression FROM content_blobs WHERE hash = ?`;

export function bodyAdoptionStatement(ref: VerifiedBodyRef, now: string) {
  return { sql: `INSERT INTO content_blobs (
    hash, storage_key, kind, mime_type, compression, original_size_bytes, stored_size_bytes,
    original_sha256, stored_sha256, availability, created_at, cached_at, last_verified_at
  ) VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'local', ?, ?, ?)
  ON CONFLICT(hash) DO NOTHING`,
  params: [ref.hash, `text/${ref.hash}`, ref.byteLength, ref.byteLength, ref.hash, ref.hash, now, now, now] };
}

export function assertBodyManifestIdentity(manifest: BodyManifest | undefined, ref: VerifiedBodyRef) {
  if (!manifest || manifest.original_sha256 !== ref.hash || manifest.stored_sha256 !== ref.hash ||
      manifest.original_size_bytes !== ref.byteLength || manifest.stored_size_bytes !== ref.byteLength ||
      manifest.compression !== 'none') throw new Error('body_manifest_identity_conflict');
}
