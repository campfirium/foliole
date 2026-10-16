import type { ForegroundTimeBucket } from '../review/foregroundTime.js';
import type { DbPort } from '../sync/dbPort.js';
import { readForegroundSource, type ForegroundSource } from '../sync/foregroundSource.js';

import { foregroundTimeId } from './foregroundTimeIdentity.js';

export async function saveForegroundTime(port: DbPort, input: {
  sourceId: string; buckets: ForegroundTimeBucket[];
  hash: (payload: ForegroundSource) => Promise<string> | string;
  mark: (tx: DbPort, record: { id: string; hash: string; updatedAt: string }) => Promise<unknown>;
}) {
  await port.transaction(async (tx) => {
    let changed = false;
    for (const bucket of input.buckets) {
      if (bucket.durationMs <= 0) continue;
      const id = foregroundTimeId(input.sourceId, bucket.day);
      const [existing] = await tx.query<{ duration_ms: number }>(
        'SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [id]);
      if (existing && existing.duration_ms >= bucket.durationMs) continue;
      await tx.run(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms)
        VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms
        WHERE excluded.duration_ms > foreground_daily_time.duration_ms`,
      [id, input.sourceId, bucket.day, bucket.durationMs]);
      changed = true;
    }
    if (changed) await input.mark(tx, { id: input.sourceId,
      hash: await input.hash(await readForegroundSource(tx, input.sourceId)), updatedAt: new Date().toISOString() });
  });
}
