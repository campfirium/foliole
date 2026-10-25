import { z } from 'zod';

import { createInitialSchedulerCard } from '../review/types.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseDriver } from './driver.js';
import type { NodeReviewPayload } from './nodeMutationPayloads.js';

const dueSchema = z.iso.datetime({ offset: true });
const STORE = 'UPDATE nodes SET initial_review_due = ? WHERE id = ? AND initial_review_due IS NULL';
const INITIALIZE = `INSERT INTO node_review
  (node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses)
  SELECT ?, ?, NULL, 0, 0, 0, 0, 0, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM review_log WHERE node_id = ?)
  ON CONFLICT(node_id) DO NOTHING`;

export function initialReviewDue(review: NodeReviewPayload | null | undefined) {
  return review && review.reps === 0 && review.state === 0 && review.lastReviewAt === null
    ? dueSchema.parse(review.due) : null;
}

export function initializeCreatedReviewSchedule(driver: DatabaseDriver, nodeId: string, review: NodeReviewPayload | null | undefined) {
  const due = initialReviewDue(review);
  if (!due) return;
  driver.execute(STORE, [due, nodeId]);
  driver.execute(INITIALIZE, [nodeId, due, nodeId]);
}

export async function initializeReceivedReviewSchedule(db: DbPort, nodeId: string, value: string | undefined) {
  if (value === undefined) return;
  const due = dueSchema.parse(value);
  const [node] = await db.query<{ initial_review_due: string | null }>('SELECT initial_review_due FROM nodes WHERE id = ?', [nodeId]);
  if (node?.initial_review_due && node.initial_review_due !== due) throw new Error('initial_review_schedule_conflict');
  await db.run(STORE, [due, nodeId]);
  await db.run(INITIALIZE, [nodeId, due, nodeId]);
}

export function ungradedInitialReviewCard(due: string | null | undefined, events: readonly { kind: string }[]) {
  return due && !events.some(event => event.kind === 'reset') ? createInitialSchedulerCard(due) : null;
}
