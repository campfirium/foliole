import type { DbPort, DbRow } from './dbPort.js';
import type { SyncIdentityPackPage } from './syncIdentityPackPage.js';

export interface SyncIdentityPackReceipt {
  databaseSha256: string;
  packId: string;
  page: SyncIdentityPackPage;
}

interface RoundRow extends DbRow {
  source_view_id: string;
  last_page_index: number;
  last_page_id: string;
}

export async function prepareSyncIdentityPackReceipt(port: DbPort, receipt: SyncIdentityPackReceipt) {
  const { page } = receipt;
  const [group] = await port.query<{ group_id: string }>(
    "SELECT group_id FROM sync_group_local_state WHERE singleton_id = 1 AND state = 'active'");
  const [member] = await port.query<{ state: string }>(`SELECT state FROM sync_group_devices
    WHERE group_id = ? AND device_identity_key = ?`, [page.group_id, page.source_peer_id]);
  if (group?.group_id !== page.group_id || member?.state !== 'active') {
    throw new Error('sync_identity_pack_source_not_member');
  }
  const key = [page.group_id, page.source_peer_id];
  const [held] = await port.query<{ source_view_id: string; page_id: string;
    database_sha256: string }>(`SELECT source_view_id, page_id, database_sha256
      FROM sync_identity_pack_receipts WHERE group_id = ? AND source_peer_id = ? AND pack_id = ?`,
  [...key, receipt.packId]);
  if (held) {
    if (held.source_view_id !== page.source_view_id || held.page_id !== page.page_id ||
        held.database_sha256 !== receipt.databaseSha256) {
      throw new Error('sync_identity_pack_receipt_collision');
    }
    return { duplicate: true };
  }
  const [retired] = await port.query<{ source_view_id: string }>(
    `SELECT source_view_id FROM sync_identity_retired_views
     WHERE group_id = ? AND source_peer_id = ? AND source_view_id = ?`,
    [...key, page.source_view_id]);
  if (retired) throw new Error('sync_identity_source_view_retired');
  const [round] = await port.query<RoundRow>(`SELECT source_view_id, last_page_index, last_page_id
    FROM sync_identity_receive_rounds WHERE group_id = ? AND source_peer_id = ?`, key);
  if (!round || round.source_view_id !== page.source_view_id) {
    if (page.page_index !== 0 || page.previous_page_id !== null) {
      throw new Error('sync_identity_page_not_contiguous');
    }
  } else if (!(page.page_index === round.last_page_index + 1 &&
      page.previous_page_id === round.last_page_id) &&
      !(page.page_index === round.last_page_index && page.page_id === round.last_page_id)) {
    throw new Error('sync_identity_page_not_contiguous');
  }
  return { duplicate: false };
}

/** Call in the same transaction as applying the verified business facts. */
export async function recordSyncIdentityPackReceipt(port: DbPort, receipt: SyncIdentityPackReceipt) {
  const { page } = receipt;
  const key = [page.group_id, page.source_peer_id];
  const [round] = await port.query<RoundRow>(
    `SELECT source_view_id, last_page_index, last_page_id FROM sync_identity_receive_rounds
     WHERE group_id = ? AND source_peer_id = ?`, key);
  const now = new Date().toISOString();
  if (round && round.source_view_id !== page.source_view_id) {
    await port.run(`INSERT INTO sync_identity_retired_views
      (group_id, source_peer_id, source_view_id, retired_at) VALUES (?, ?, ?, ?)`,
    [...key, round.source_view_id, now]);
    for (const table of ['sync_identity_fact_staging', 'sync_identity_fact_sections']) {
      await port.run(`DELETE FROM ${table} WHERE group_id = ? AND source_peer_id = ? AND source_view_id = ?`,
        [...key, round.source_view_id]);
    }
  }
  await port.run(`INSERT INTO sync_identity_receive_rounds
    (group_id, source_peer_id, source_view_id, last_page_index, last_page_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(group_id, source_peer_id) DO UPDATE SET
    source_view_id = excluded.source_view_id,
    last_page_index = excluded.last_page_index, last_page_id = excluded.last_page_id,
    updated_at = excluded.updated_at`,
  [...key, page.source_view_id, page.page_index, page.page_id, now]);
  await port.run(`INSERT INTO sync_identity_pack_receipts
    (group_id, source_peer_id, source_view_id, page_id, pack_id, database_sha256, applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [...key, page.source_view_id, page.page_id, receipt.packId, receipt.databaseSha256, now]);
}
