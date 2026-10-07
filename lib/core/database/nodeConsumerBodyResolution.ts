import type { DatabaseDriver } from './driver.js';
import { loadNodeBodyResolution, type NodeBodyResolution } from './nodeBodyResolution.js';

/** Folders without a body identity have no document body; articles require verified stable content. */
export function loadNodeConsumerBody(
  driver: DatabaseDriver, nodeId: string, storage: 'continuous' | 'chunked'
): NodeBodyResolution | null {
  if (storage === 'chunked') {
    const node = driver.queryOne<{ kind: string | null; body_blob_hash: string | null; empty: number }>(
      "SELECT kind, body_blob_hash, content = '' AS empty FROM nodes WHERE id = ?", [nodeId]);
    if (!node) return null;
    if (node.kind === 'folder' && node.body_blob_hash === null && node.empty === 1) {
      return { bodyBlobHash: null, content: '', source: 'legacy_inline', status: 'resolved' };
    }
  }
  return loadNodeBodyResolution(driver, nodeId, storage);
}
