import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from '../../lib/core/database/searchIndexInvalidations.js';

interface StaleBodyRow extends DatabaseRow {
  body_text: string;
  current_version_id: string;
  id: string;
}

export function reconcileVersionedInlineBodies(driver: DatabaseDriver) {
  const stale = driver.queryAll<StaleBodyRow>(
    `SELECT n.id, n.current_version_id, version.body_text
     FROM nodes n
     JOIN node_sync_versions version ON version.version_id = n.current_version_id
       AND version.object_id = n.id
     WHERE n.deleted_at IS NULL AND n.sync_dirty = 0
       AND n.body_blob_hash IS NULL AND n.content = ''
       AND version.body_text IS NOT NULL AND version.body_text <> ''`
  );
  if (stale.length === 0) return 0;

  driver.transaction(() => {
    for (const row of stale) {
      const hash = upsertTextBodyBlob(driver, row.body_text, new Date().toISOString());
      const result = driver.execute(
        `UPDATE nodes SET content = ?, body_blob_hash = ?
         WHERE id = ? AND current_version_id = ? AND sync_dirty = 0
           AND deleted_at IS NULL AND body_blob_hash IS NULL AND content = ''`,
        [row.body_text, hash, row.id, row.current_version_id]
      );
      if (result.changes !== 1) throw new Error(`sync_body_projection_changed:${row.id}`);
    }
    enqueueWorkspaceSearchInvalidationForNodeIds(driver, stale.map((row) => row.id));
  });
  return stale.length;
}
