import type { DbPort } from '../sync/dbPort.js';
import { loadVerifiedBodyRef, readBodyText } from '../sync/verifiedBody.js';

import { NodeBodyUnavailableError, type NodeBodyResolution } from './nodeBodyResolution.js';

/** Explicit stable-storage single-article editor/background read, never ordinary sync apply. */
export async function loadNodeBodyResolutionWithPort(
  db: DbPort, nodeId: string, storage: 'chunked'
): Promise<NodeBodyResolution | null> {
  if (storage !== 'chunked') throw new Error('node_body_storage_invalid');
  const [row] = await db.query<{ body_blob_hash: string | null }>('SELECT body_blob_hash FROM nodes WHERE id = ?', [nodeId]);
  if (!row) return null;
  const hash = row.body_blob_hash?.trim();
  if (!hash) throw new NodeBodyUnavailableError([nodeId]);
  const ref = await loadVerifiedBodyRef(db, hash);
  return ref ? { bodyBlobHash: hash, content: await readBodyText(db, ref), source: 'blob', status: 'resolved' }
    : { bodyBlobHash: hash, status: 'unavailable' };
}
