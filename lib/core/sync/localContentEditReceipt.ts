import type { DbPort } from './dbPort.js';
import { contentEditImageInputHash } from './localContentEditResources.js';

/** Retry inputs belong to this device, independently of immutable version facts. */
export async function assertLocalContentEditReceipt(db: DbPort, versionId: string, imageInputHash: string) {
  const [receipt] = await db.query<{ content_edit_image_input_hash: string | null }>(
    'SELECT content_edit_image_input_hash FROM node_version_local_origins WHERE version_id = ?', [versionId]);
  // Before image descriptions joined save requests, a local origin implied an empty image input.
  if (!receipt || (receipt.content_edit_image_input_hash ?? contentEditImageInputHash([])) !== imageInputHash) {
    throw new Error('content_edit_version_mismatch');
  }
}

export async function recordLocalContentEditReceipt(db: DbPort, versionId: string, imageInputHash: string) {
  await db.run(`INSERT INTO node_version_local_origins (version_id, content_edit_image_input_hash)
    VALUES (?, ?) ON CONFLICT(version_id) DO UPDATE SET content_edit_image_input_hash = excluded.content_edit_image_input_hash`,
  [versionId, imageInputHash]);
}
