import { loadForegroundSource } from '../../lib/core/database/foregroundTimeSource.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ForegroundTimeBucket } from '../../lib/core/review/foregroundTime.js';
import { foregroundTimeId } from '../../lib/core/sync/syncForegroundDailyTime.js';

import type { DatabaseConnection } from './connection.js';
import { loadDesktopForegroundOwner } from './foregroundTimeOwner.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

export function readDesktopForegroundSource(connection: DatabaseConnection) {
  const sourceId = loadForegroundSource(connection.driver, loadDesktopForegroundOwner(connection.dbPath));
  const rows = connection.driver.queryAll<{ day_key: string; duration_ms: number }>(
    'SELECT day_key, duration_ms FROM foreground_daily_time WHERE source_id = ?', [sourceId]);
  return { sourceId, baseline: rows.map((row) => ({ day: row.day_key, durationMs: row.duration_ms })) };
}

export function saveDesktopForegroundSnapshot(connection: DatabaseConnection,
  snapshot: { sourceId: string; buckets: ForegroundTimeBucket[] }) {
  connection.driver.transaction((driver) => {
    for (const bucket of snapshot.buckets) {
      if (bucket.durationMs <= 0) continue;
      const id = foregroundTimeId(snapshot.sourceId, bucket.day);
      const previous = driver.queryOne<{ duration_ms: number }>('SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [id]);
      if (previous && previous.duration_ms >= bucket.durationMs) continue;
      const payload = { source_id: snapshot.sourceId, day_key: bucket.day, duration_ms: bucket.durationMs };
      driver.execute(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms`, [id, payload.source_id, payload.day_key, payload.duration_ms]);
      upsertSyncObjectState(driver, { objectType: 'foreground_daily_time', objectId: id,
        contentHash: computeSyncContentHash('foreground_daily_time', payload),
        lastModifiedByHostName: loadOrCreateDesktopHostName(), updatedAt: new Date().toISOString(), syncDirty: true });
    }
  });
}
