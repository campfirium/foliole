import type { ForegroundTimeBucket } from '../review/foregroundTime.js';
import type { DbPort } from '../sync/dbPort.js';
import { foregroundTimeId } from '../sync/syncForegroundDailyTime.js';

export async function saveForegroundTime(port: DbPort, input: {
  sourceId: string; buckets: ForegroundTimeBucket[];
  hash: (payload: { source_id: string; day_key: string; duration_ms: number }) => Promise<string> | string;
  mark: (tx: DbPort, record: { id: string; hash: string; updatedAt: string }) => Promise<unknown>;
}) {
  await port.transaction(async (tx) => {
    for (const bucket of input.buckets) {
      if (bucket.durationMs <= 0) continue;
      const id = foregroundTimeId(input.sourceId, bucket.day);
      const [existing] = await tx.query<{ duration_ms: number }>(
        'SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [id]);
      if (existing && existing.duration_ms >= bucket.durationMs) continue;
      const payload = { source_id: input.sourceId, day_key: bucket.day, duration_ms: bucket.durationMs };
      await tx.run(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms)
        VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms
        WHERE excluded.duration_ms > foreground_daily_time.duration_ms`,
      [id, input.sourceId, bucket.day, bucket.durationMs]);
      await input.mark(tx, { id, hash: await input.hash(payload), updatedAt: new Date().toISOString() });
    }
  });
}
