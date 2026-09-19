import { parseImageSources, serializeImageSources, type ImageSources } from '../../lib/core/database/imageSources.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { flushNodeSyncVersion } from './nodeSyncVersions.js';

export function readNodeImageSources(nodeId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ image_sources: string | null }>(
    'SELECT image_sources FROM nodes WHERE id = ?', [nodeId]
  );
  return row ? parseImageSources(row.image_sources) : null;
}

export function registerNodeImageSources(nodeId: string, sources: ImageSources) {
  const driver = openDatabaseConnection().driver;
  driver.transaction(() => {
    const current = readNodeImageSources(nodeId);
    if (!current) throw new Error('image_source_node_not_found');
    const next = serializeImageSources({ ...current, ...parseImageSources(sources) });
    if (next === serializeImageSources(current)) return;
    const now = new Date().toISOString();
    const hostName = loadOrCreateDesktopHostName(now);
    driver.execute(
      `UPDATE nodes SET image_sources = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
      [next, now, hostName, nodeId]
    );
    flushNodeSyncVersion(nodeId, now);
  });
}
