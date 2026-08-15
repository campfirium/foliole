import { openDatabaseConnection } from './connection.js';

export function loadDesktopSyncGroupWorkgroupKey(groupId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ workgroup_key: string | null }>(
    'SELECT workgroup_key FROM sync_groups WHERE group_id = ? LIMIT 1', [groupId]
  );
  return typeof row?.workgroup_key === 'string' && row.workgroup_key.trim()
    ? row.workgroup_key.trim() : null;
}

export function saveDesktopSyncGroupWorkgroupKey(groupId: string, workgroupKey: string) {
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    const row = driver.queryOne<{ workgroup_key: string | null }>(
      'SELECT workgroup_key FROM sync_groups WHERE group_id = ? LIMIT 1', [groupId]
    );
    if (!row) throw new Error('sync_group_not_available');
    if (row.workgroup_key && row.workgroup_key !== workgroupKey) {
      throw new Error('sync_group_workgroup_key_mismatch');
    }
    driver.execute('UPDATE sync_groups SET workgroup_key = ?, updated_at = ? WHERE group_id = ?',
      [workgroupKey, new Date().toISOString(), groupId]);
  });
}

export function consumeDesktopSyncGroupNonce(
  groupId: string,
  identity: string,
  nowMs: number,
  expiresAt: number
) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    driver.execute('DELETE FROM sync_group_nonce_ledger WHERE expires_at <= ?', [nowMs]);
    const found = driver.queryOne<{ present: number }>(
      'SELECT 1 AS present FROM sync_group_nonce_ledger WHERE group_id = ? AND identity = ? LIMIT 1',
      [groupId, identity]
    );
    if (found?.present === 1) return false;
    driver.execute(
      'INSERT INTO sync_group_nonce_ledger (group_id, identity, expires_at) VALUES (?, ?, ?)',
      [groupId, identity, expiresAt]
    );
    return true;
  });
}
