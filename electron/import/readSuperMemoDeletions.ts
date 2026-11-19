import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import type { SuperMemoDeletedEntry } from '../../lib/platform/nativeSuperMemoImportContract.js';

export function readSuperMemoDeletions(driver: DatabaseDriver, batchId: string): SuperMemoDeletedEntry[] {
  return driver.queryAll<SuperMemoDeletedEntry>(`
    SELECT json_extract(entry.value, '$.id') AS sourceId,
           COALESCE(json_extract(entry.value, '$.title'), '') AS title,
           CASE WHEN node.id IS NULL THEN 'permanent' ELSE 'trash' END AS status
    FROM workspace_meta AS batch
    JOIN json_each(batch.value, '$.entries') AS entry
    LEFT JOIN nodes AS node ON node.id = json_extract(entry.value, '$.nodeId')
    WHERE batch.key = ?
      AND json_extract(entry.value, '$.nodeId') IS NOT NULL
      AND (node.id IS NULL OR node.deleted_at IS NOT NULL)
    ORDER BY sourceId
  `, [`supermemo-import:${batchId}`]);
}
