import type { DatabaseDriver } from '../../lib/core/database/driver.js';

export function markUnversionedNodeOrderDirty(driver: DatabaseDriver, hostName: string) {
  const rows = driver.queryAll<{ id: string }>(`
    SELECT n.id
    FROM nodes n
    JOIN node_order o ON o.node_id = n.id
    JOIN node_sync_versions v ON v.version_id = n.current_version_id
    WHERE n.id NOT IN ('special-inbox', 'special-virtual-root')
      AND CASE WHEN json_valid(v.snapshot_json)
        THEN json_type(v.snapshot_json, '$.position') = 'integer'
          AND json_extract(v.snapshot_json, '$.position') IS NOT o.position
        ELSE 0 END
  `);
  for (const row of rows) {
    driver.execute(
      `UPDATE nodes SET sync_dirty = 1, last_modified_by_host_name = ? WHERE id = ?`,
      [hostName, row.id]
    );
  }
}
