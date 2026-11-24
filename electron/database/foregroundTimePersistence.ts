import { foregroundTimeId } from '../../lib/core/database/foregroundTimeIdentity.js';
import { loadForegroundSource } from '../../lib/core/database/foregroundTimeSource.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ForegroundTimeBucket } from '../../lib/core/review/foregroundTime.js';

import type { DatabaseConnection } from './connection.js';
import { updateForegroundTimeDigest, type ForegroundTimeDigest } from './foregroundTimeDigest.js';
import { loadDesktopForegroundOwner } from './foregroundTimeOwner.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

const digests = new WeakMap<DatabaseConnection, ForegroundTimeDigest>();

export function readDesktopForegroundSource(connection: DatabaseConnection) {
  const sourceId = loadForegroundSource(connection.driver, loadDesktopForegroundOwner(connection.dbPath));
  const rows = connection.driver.queryAll<{ day_key: string; duration_ms: number }>(
    'SELECT day_key, duration_ms FROM foreground_daily_time WHERE source_id = ?', [sourceId]);
  return { sourceId, baseline: rows.map((row) => ({ day: row.day_key, durationMs: row.duration_ms })) };
}

export function saveDesktopForegroundSnapshot(connection: DatabaseConnection,
  snapshot: { sourceId: string; buckets: ForegroundTimeBucket[] }) {
  const nextDigest = connection.driver.transaction((driver) => {
    const changed = new Map<string, number>();
    for (const bucket of snapshot.buckets) {
      if (bucket.durationMs <= 0) continue;
      const id = foregroundTimeId(snapshot.sourceId, bucket.day);
      const previous = driver.queryOne<{ duration_ms: number }>('SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [id]);
      if (previous && previous.duration_ms >= bucket.durationMs) continue;
      const payload = { source_id: snapshot.sourceId, day_key: bucket.day, duration_ms: bucket.durationMs };
      driver.execute(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms`, [id, payload.source_id, payload.day_key, payload.duration_ms]);
      changed.set(bucket.day, bucket.durationMs);
    }
    if (changed.size === 0) return;
    const digest = updateForegroundTimeDigest(driver, snapshot.sourceId, Object.fromEntries(changed), digests.get(connection));
    upsertSyncObjectState(driver, { objectType: 'foreground_source', objectId: snapshot.sourceId,
      contentHash: digest.hash,
      lastModifiedByHostName: loadOrCreateDesktopHostName(), updatedAt: new Date().toISOString(), syncDirty: true });
    return digest;
  });
  if (nextDigest) digests.set(connection, nextDigest);
}
