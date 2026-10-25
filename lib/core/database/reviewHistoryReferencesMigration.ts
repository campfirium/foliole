import { z } from 'zod';

import type { DbPort } from '../sync/dbPort.js';

const state = z.object({ due: z.string(), stability: z.number(), difficulty: z.number() }).passthrough();
const reviewEntry = z.object({
  type: z.literal('review.grade'), id: z.string(), nodeId: z.string(), reviewOpId: z.string().optional(),
  beforeReview: state.nullable(), afterReview: state.extend({ lastReviewAt: z.string() })
}).passthrough();
const history = z.object({ undoStack: z.array(z.unknown()), redoStack: z.array(z.unknown()) }).passthrough();
const log = z.object({ op_id: z.string(), node_id: z.string(), reviewed_at: z.string(),
  due_before: z.string(), stability_before: z.number(), difficulty_before: z.number(),
  due_after: z.string(), stability_after: z.number(), difficulty_after: z.number() }).passthrough();

// Link existing undo entries while the exact before/after facts still exist.
// Ambiguous entries remain untouched; never guess a target or discard the user's history.
export async function migrateCompanionReviewHistoryReferences(db: DbPort) {
  const records = (await db.query('SELECT * FROM review_log')).map(row => log.parse(row));
  const stored = await db.query<{ key: string; value: string }>(
    "SELECT key, value FROM companion_meta WHERE key LIKE 'flow_history:%'");
  for (const row of stored) {
    const parsed = history.safeParse(JSON.parse(row.value));
    if (!parsed.success) continue;
    const repair = (value: unknown) => {
      const entry = reviewEntry.safeParse(value);
      if (!entry.success || entry.data.reviewOpId) return value;
      const { nodeId, beforeReview: before, afterReview: after } = entry.data;
      const matches = records.filter(record => record.node_id === nodeId && record.reviewed_at === after.lastReviewAt
        && record.due_after === after.due && record.stability_after === after.stability
        && record.difficulty_after === after.difficulty && (!before || (
          record.due_before === before.due && record.stability_before === before.stability
          && record.difficulty_before === before.difficulty)));
      return matches.length === 1 ? { ...entry.data, reviewOpId: matches[0]!.op_id } : value;
    };
    await db.run('UPDATE companion_meta SET value = ? WHERE key = ?', [JSON.stringify({ ...parsed.data,
      undoStack: parsed.data.undoStack.map(repair), redoStack: parsed.data.redoStack.map(repair) }), row.key]);
  }
}
