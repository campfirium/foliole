import { z } from 'zod';

import { computeSyncContentHash } from '../database/syncState.js';
import { validateReviewDayKey } from '../review/topicDailyCountIdentity.js';

import type { DbPort } from './dbPort.js';
import type { SyncObjectRecord } from './syncObjectRecord.js';

export const foregroundSourceSchema = z.object({
  source_id: z.string().uuid(),
  days: z.record(z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
});
export type ForegroundSource = z.infer<typeof foregroundSourceSchema>;
export const FOREGROUND_SOURCE_PAYLOAD_SQL = `SELECT json_object('source_id', source_id,
  'days', json_group_object(day_key, duration_ms)) AS payload_json
  FROM (SELECT source_id, day_key, duration_ms FROM foreground_daily_time WHERE source_id = ? ORDER BY day_key)
  GROUP BY source_id`;

export async function readForegroundSource(db: DbPort, sourceId: string): Promise<ForegroundSource> {
  const rows = await db.query<{ day_key: string; duration_ms: number }>(
    'SELECT day_key, duration_ms FROM foreground_daily_time WHERE source_id = ? ORDER BY day_key', [sourceId]);
  return { source_id: sourceId, days: Object.fromEntries(rows.map(row => [row.day_key, row.duration_ms])) };
}
function parse(record: SyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('foreground_source_invalid');
  const payload = foregroundSourceSchema.parse(JSON.parse(record.payload_json));
  if (payload.source_id !== record.object_id) throw new Error('foreground_source_identity_invalid');
  for (const day of Object.keys(payload.days)) validateReviewDayKey(day);
  if (computeSyncContentHash('foreground_source', payload) !== record.content_hash) throw new Error('foreground_source_hash_invalid');
  return payload;
}
export async function shouldApplyForegroundSource(db: DbPort, record: SyncObjectRecord) {
  const incoming = parse(record);
  const current = await readForegroundSource(db, incoming.source_id);
  return Object.entries(incoming.days).some(([day, value]) => current.days[day] === undefined || current.days[day]! < value);
}
export async function applyForegroundSource(db: DbPort, record: SyncObjectRecord) {
  const incoming = parse(record);
  for (const [day, value] of Object.entries(incoming.days)) {
    await db.run(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET duration_ms = MAX(foreground_daily_time.duration_ms, excluded.duration_ms)`,
    [`${incoming.source_id}:${day}`, incoming.source_id, day, value]);
  }
}
