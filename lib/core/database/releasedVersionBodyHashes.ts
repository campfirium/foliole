import { hashTextBody } from './textBodyHash.js';

export const RELEASED_VERSION_BODY_SQL = 'SELECT body_text, snapshot_json FROM node_sync_versions WHERE version_id = ?';
export interface ReleasedVersionBody extends Record<string, unknown> {
  body_text: string | null;
  snapshot_json: string | null;
}

export function releasedVersionBodyHashes(rows: readonly ReleasedVersionBody[]) {
  const hashes = new Set<string>();
  for (const row of rows) {
    if (row.body_text !== null) hashes.add(hashTextBody(row.body_text));
    const snapshot = (JSON.parse(row.snapshot_json ?? '{}') ?? {}) as { body_blob_hash?: string; content?: string; text_alternatives?: { body_blob_hash: string }[] };
    for (const entry of snapshot.text_alternatives ?? []) hashes.add(entry.body_blob_hash);
    if (snapshot.body_blob_hash) hashes.add(snapshot.body_blob_hash);
    if (typeof snapshot.content === 'string') hashes.add(hashTextBody(snapshot.content));
  }
  return [...hashes];
}
