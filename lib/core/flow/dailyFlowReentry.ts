import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSettings } from './dailyFlowContract.js';
import { scopedDailySnapshot } from './dailyFlowGrade.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { readDailyFlow } from './dailyFlowStorage.js';

// Reentry is an eligibility boundary; ordinary actions retain their scoped paths.
export async function hasNewReadyDailyCandidate(db: DbPort,
  stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>, now: string,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const rows = await db.query<{ node_id: string }>(`SELECT e.node_id FROM daily_flow_entries e
    JOIN node_review r ON r.node_id = e.node_id WHERE e.queue_position IS NULL
      AND r.scheduled_days < 1 AND julianday(r.due) <= julianday(?)
    UNION SELECT e.node_id FROM daily_flow_entries e
    JOIN nodes n ON n.id = e.node_id LEFT JOIN node_reading r ON r.node_id = e.node_id
    WHERE e.queue_position IS NULL AND n.kind = 'topic'
      AND julianday(COALESCE(r.next_at, n.created_at)) <= julianday(?)`, [now, now]);
  const session = stored.session;
  const selected = new Set([session.currentNodeId, session.continueNodeId,
    ...(session.soonNodeIds ?? []), ...(session.hiddenSoonNodeIds ?? [])]);
  const ids = rows.map(row => row.node_id).filter(id => !selected.has(id));
  if (!ids.length) return false;
  const nodeOrder = [...session.queueNodeIds, ...ids];
  const snapshot = await scopedDailySnapshot(db, persistence, nodeOrder);
  const plan = flowPlan({ ...snapshot, nodeOrder }, stored.mode as ReviewSessionMode, now, settings);
  const candidates = new Set(ids);
  const defersReading = Boolean(session.soonNodeIds?.length ||
    (session.currentNodeId && !session.queueNodeIds.includes(session.currentNodeId)));
  return (stored.mode !== 'reading-only' && plan.fsrsQueueNodeIds.some(id => candidates.has(id))) ||
    (stored.mode !== 'review-first' && !defersReading &&
      (stored.mode === 'reading-only' ? plan.readingQueueNodeIds : plan.queueNodeIds)
        .some(id => candidates.has(id) && plan.readingQueueNodeIds.includes(id)));
}
