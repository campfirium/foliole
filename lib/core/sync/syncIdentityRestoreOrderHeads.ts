import type { DbPort } from './dbPort.js';
import { advanceParentOrderHead, readParentOrderVersion } from './syncParentOrderVersionStore.js';

/** Full restore adopts the source's exact order head after its immutable facts are saved. */
export async function restoreSyncIdentityParentOrderHeads(port: DbPort) {
  const rows = await port.query<{ object_id: string; current_version_id: string }>(
    `SELECT object_id, current_version_id FROM inc.sync_object_state
     WHERE object_type = 'parent_child_order' AND deleted_at IS NULL AND current_version_id IS NOT NULL`);
  for (const row of rows) {
    const version = await readParentOrderVersion(port, row.current_version_id);
    const [order] = await port.query<{ child_ids_json: string }>(
      'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [row.object_id]);
    if (!version || version.parentId !== row.object_id ||
        JSON.stringify(version.order) !== order?.child_ids_json) {
      throw new Error('sync_identity_restore_order_head_mismatch');
    }
    await advanceParentOrderHead(port, row.object_id, row.current_version_id);
    await port.run(`UPDATE sync_object_state SET current_version_id = ?
      WHERE object_type = 'parent_child_order' AND object_id = ?`, [row.current_version_id, row.object_id]);
  }
}
