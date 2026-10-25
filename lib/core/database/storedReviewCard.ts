import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';

const SQL = `SELECT due, last_review_at AS last_review, state, stability, difficulty,
  elapsed_days, scheduled_days, reps, lapses FROM node_review WHERE node_id = ?`;
const schema = z.object({ due: z.string(), last_review: z.string().nullable(),
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  stability: z.number(), difficulty: z.number(), elapsed_days: z.number(), scheduled_days: z.number(),
  reps: z.number(), lapses: z.number() });

export function readStoredReviewCard(driver: DatabaseDriver, nodeId: string) {
  const row = driver.queryOne(SQL, [nodeId]);
  return row ? schema.parse(row) : null;
}

export async function readStoredReviewCardWithDb(db: DbPort, nodeId: string) {
  const [row] = await db.query(SQL, [nodeId]);
  return row ? schema.parse(row) : null;
}
