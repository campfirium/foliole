import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { assertReadySyncIdentityIndex } from '../../../../../lib/core/sync/syncIdentityIndexMaintenance';
import { parseSyncIdentityPackPage } from '../../../../../lib/core/sync/syncIdentityPackPage';

import { withCompanionSyncIdentitySnapshot } from './syncGroupIdentitySourceRead';

/** Validate a v21 request against the fixed native snapshot before copying any pack rows. */
export async function prepareCompanionSyncIdentityPack(port: DbPort,
  payload: Record<string, unknown>) {
  const page = parseSyncIdentityPackPage(payload.page);
  if (page.objects.length === 0 || page.source_view_id !== payload.source_view_id ||
      page.target_peer_id !== payload.authenticated_device_id) {
    throw new Error('sync_identity_pack_peer_mismatch');
  }
  return withCompanionSyncIdentitySnapshot(port, payload.snapshot_path, async (snapshot) => {
    await assertReadySyncIdentityIndex(snapshot, 'identity_view');
    const [local] = await snapshot.query<{ group_id: string; local_device_identity_key: string }>(
      `SELECT group_id, local_device_identity_key FROM identity_view.sync_group_local_state
       WHERE singleton_id = 1 AND state = 'active'`);
    const [target] = await snapshot.query<{ state: string }>(
      `SELECT state FROM identity_view.sync_group_devices
       WHERE group_id = ? AND device_identity_key = ?`,
      [page.group_id, page.target_peer_id]);
    if (local?.group_id !== page.group_id ||
        local.local_device_identity_key !== page.source_peer_id ||
        target?.state !== 'active') throw new Error('sync_identity_pack_peer_mismatch');
    for (const object of page.objects) {
      const [indexed] = await snapshot.query<{ fingerprint: string }>(
        `SELECT fingerprint FROM identity_view.sync_identity_index_rows
         WHERE object_type = ? AND object_id = ?`,
        [object.object_type, object.object_id]);
      if (indexed?.fingerprint !== object.fingerprint) {
        throw new Error('sync_identity_pack_source_changed');
      }
    }
    return { page_id: page.page_id };
  });
}
