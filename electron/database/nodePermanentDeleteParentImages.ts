import { parseStoredAnchorLink } from '../../lib/core/database/anchorLinkCodec.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { parseStoredImageRegions } from '../../lib/core/database/imageRegionCodec.js';
import { removeDeletedNodeImageRegions } from '../../lib/core/nodes/imageRegionRemoval.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

/** Uses only selected children's image facts and their current parents, within the delete transaction. */
export function removePermanentDeleteParentImages(driver: DatabaseDriver, nodeIds: string[], hostName: string, now: string) {
  const rows = driver.queryAll<{ anchor_link: string | null; image_regions: string | null; parent_id: string }>(
    `SELECT anchor_link, image_regions, parent_id FROM nodes
     WHERE id IN (SELECT value FROM json_each(?)) AND parent_id IS NOT NULL AND anchor_link IS NOT NULL`,
    [JSON.stringify(nodeIds)]
  );
  const selected = new Set(nodeIds);
  const parents = new Map<string, ReturnType<typeof parseStoredImageRegions>>();
  const originals = new Map<string, ReturnType<typeof parseStoredImageRegions>>();
  for (const row of rows) {
    if (selected.has(row.parent_id)) continue;
    if (!parents.has(row.parent_id)) {
      const parent = driver.queryOne<{ image_regions: string | null }>(
        'SELECT image_regions FROM nodes WHERE id = ? AND deleted_at IS NULL', [row.parent_id]
      );
      const regions = parseStoredImageRegions(parent?.image_regions);
      parents.set(row.parent_id, regions);
      originals.set(row.parent_id, regions);
    }
    parents.set(row.parent_id, removeDeletedNodeImageRegions(parents.get(row.parent_id), {
      anchorLink: parseStoredAnchorLink(row.anchor_link), imageRegions: parseStoredImageRegions(row.image_regions)
    }) ?? null);
  }
  for (const [nodeId, imageRegions] of parents) {
    if (imageRegions === originals.get(nodeId)) continue;
    flushNodeSyncVersionWithDriver(driver, nodeId, hostName, now);
    driver.execute(
      `UPDATE nodes SET image_regions = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [imageRegions?.length ? JSON.stringify(imageRegions) : null, now, hostName, nodeId]
    );
    flushNodeSyncVersionWithDriver(driver, nodeId, hostName, now);
  }
}
