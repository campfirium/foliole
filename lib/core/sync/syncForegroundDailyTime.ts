import { z } from 'zod';

import { validateReviewDayKey } from '../review/topicDailyCountIdentity.js';

import type { DbPort } from './dbPort.js';
import type { SyncPackSyncObjectRecord } from './syncPackSyncObjectsExecutor.js';

const payloadSchema = z.object({
  source_id: z.string().uuid(), day_key: z.string(),
  duration_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});

export function foregroundTimeId(sourceId: string, day: string) { return `${sourceId}:${day}`; }

export function parseForegroundTime(record: SyncPackSyncObjectRecord) {
  if (record.deleted_at || !record.payload_json) throw new Error('Invalid foreground time record');
  const payload = payloadSchema.parse(JSON.parse(record.payload_json));
  validateReviewDayKey(payload.day_key);
  if (record.object_id !== foregroundTimeId(payload.source_id, payload.day_key)) {
    throw new Error('Invalid foreground time identity');
  }
  return payload;
}

export async function shouldApplyForegroundTime(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = parseForegroundTime(record);
  const [existing] = await port.query<{ duration_ms: number }>(
    'SELECT duration_ms FROM foreground_daily_time WHERE id = ?', [record.object_id]);
  return !existing || payload.duration_ms > existing.duration_ms;
}

export async function applyForegroundDailyTime(port: DbPort, record: SyncPackSyncObjectRecord) {
  const payload = parseForegroundTime(record);
  if (!await shouldApplyForegroundTime(port, record)) return false;
  await port.run(`INSERT INTO foreground_daily_time(id, source_id, day_key, duration_ms)
    VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET duration_ms = excluded.duration_ms
    WHERE excluded.duration_ms > foreground_daily_time.duration_ms`,
  [record.object_id, payload.source_id, payload.day_key, payload.duration_ms]);
  return true;
}
