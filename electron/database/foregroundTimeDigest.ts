import { createHash, type Hash } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { foregroundSourceSchema, FOREGROUND_SOURCE_PAYLOAD_SQL } from '../../lib/core/sync/foregroundSource.js';

type Day = [day: string, durationMs: number];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;

export interface ForegroundTimeDigest {
  sourceId: string;
  hash: string;
  prefix: Hash;
  last: Day;
}

export function updateForegroundTimeDigest(
  driver: DatabaseDriver, sourceId: string, changed: Record<string, number>, previous?: ForegroundTimeDigest
) {
  if (previous?.sourceId === sourceId) {
    const state = driver.queryOne<{ content_hash: string }>(
      "SELECT content_hash FROM sync_object_state WHERE object_type = 'foreground_source' AND object_id = ?", [sourceId]);
    const days = orderedDays(foregroundSourceSchema.shape.days.parse(changed));
    const first = days[0]!;
    const order = first[0].localeCompare(previous.last[0]);
    if (state?.content_hash === previous.hash && (order > 0 || first[0] === previous.last[0]) &&
        ISO_DAY.test(previous.last[0]) && days.every(([day]) => ISO_DAY.test(day))) {
      const prefix = previous.prefix.copy();
      if (order > 0) appendDay(prefix, previous.last);
      return finishDigest(sourceId, prefix, days);
    }
  }

  // Cold start, a peer change, or a backdated entry can change the prefix.
  const row = driver.queryOne<{ payload_json: string }>(FOREGROUND_SOURCE_PAYLOAD_SQL, [sourceId]);
  if (!row) throw new Error('foreground_source_missing');
  const payload = foregroundSourceSchema.parse(JSON.parse(row.payload_json));
  return finishDigest(sourceId, createHash('sha256').update('{"days":{'), orderedDays(payload.days));
}

function orderedDays(days: Record<string, number>): Day[] {
  return Object.entries(days).sort(([left], [right]) => left.localeCompare(right));
}

function encodeDay([day, duration]: Day) {
  return `${JSON.stringify(day)}:${JSON.stringify(duration)}`;
}

function appendDay(prefix: Hash, day: Day) {
  prefix.update(encodeDay(day)).update(',');
}

function finishDigest(sourceId: string, prefix: Hash, days: Day[]): ForegroundTimeDigest {
  const last = days.at(-1)!;
  for (const day of days.slice(0, -1)) appendDay(prefix, day);
  // Match the canonical sync JSON. Only the final day's bytes need to change on an ordinary checkpoint.
  const hash = prefix.copy().update(encodeDay(last)).update(`},"source_id":${JSON.stringify(sourceId)}}`).digest('hex');
  return { sourceId, hash, prefix, last };
}
