import { normalizeNewItemLoadBalancingDays } from '../../../../../lib/core/review/newItemReviewSlots';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Visible review items due on or near the days a new item may be spread over, so a new cloze is balanced
 * against the same load the whole snapshot would show without reading the library. The window is wider than
 * the balancing days; the allocator counts only the days it offers.
 */
const REVIEW_LOAD_SQL = `WITH RECURSIVE due_items(id, due) AS (
  SELECT n.id, nr.due FROM node_review nr
  INNER JOIN nodes n ON n.id = nr.node_id
  WHERE nr.due >= ? AND nr.due < ? AND n.kind = 'item' AND +n.deleted_at IS NULL
), ancestry(item_id, node_id) AS (
  SELECT id, id FROM due_items
  UNION
  SELECT ancestry.item_id, node.parent_id FROM ancestry
  INNER JOIN nodes node ON node.id = ancestry.node_id
  WHERE node.parent_id IS NOT NULL
)
SELECT item.due FROM due_items item
WHERE EXISTS (SELECT 1 FROM ancestry INNER JOIN nodes node ON node.id = ancestry.node_id
    WHERE ancestry.item_id = item.id AND node.parent_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM ancestry INNER JOIN nodes node ON node.id = ancestry.node_id
    WHERE ancestry.item_id = item.id AND node.deleted_at IS NOT NULL)`;

export async function loadNewItemReviewLoadWithDb(db: DbPort, now: string) {
  const days = normalizeNewItemLoadBalancingDays(getCurrentReviewSchedulerSettings().newItemLoadBalancingDays);
  const at = new Date(now).getTime();
  const rows = await db.query<{ due: string }>(REVIEW_LOAD_SQL,
    [new Date(at - 2 * DAY_MS).toISOString(), new Date(at + (days + 3) * DAY_MS).toISOString()]);
  return rows.map(row => ({ kind: 'item', review: { due: row.due } }));
}
