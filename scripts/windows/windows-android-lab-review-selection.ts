import type Database from 'better-sqlite3';

import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.ts';
import { buildReviewQueuePlan, type ReviewQueueNode } from '../../src/store/reviewQueuePlanner.ts';

type Sqlite = InstanceType<typeof Database>;

interface ReviewNodeRow {
  content: string;
  created_at: string;
  deleted_at: string | null;
  due: string | null;
  id: string;
  kind: 'folder' | 'item' | 'topic';
  next_at: string | null;
  parent_id: string | null;
  priority: number | null;
  reading_priority: number | null;
  reading_state: string | null;
  reveal: string | null;
  shelved_at: string | null;
}

function toPlannerNode(row: ReviewNodeRow): ReviewQueueNode {
  return {
    content: row.content,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    hasContent: Boolean(row.content.trim()),
    id: row.id,
    kind: row.kind,
    parentNodeId: row.parent_id,
    priority: row.priority,
    reading: row.next_at ? {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: null,
      nextAt: row.next_at,
      priority: row.reading_priority ?? 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: row.reading_state ?? 'active'
    } : null,
    reveal: row.reveal,
    review: row.due ? {
      difficulty: 0, due: row.due, elapsedDays: 0, lapses: 0, lastReviewAt: null,
      reps: 0, scheduledDays: 0, stability: 0, state: 0
    } : null,
    shelvedAt: row.shelved_at
  };
}

export function selectReviewAcceptanceObjects(
  db: Sqlite,
  settings: ReviewSchedulerSettings,
  now: string
) {
  const rows = db.prepare(
    `SELECT n.id, n.parent_id, n.kind, n.priority, n.shelved_at, n.content, n.reveal, n.created_at, n.deleted_at,
      rd.next_at, rd.priority AS reading_priority, rd.state AS reading_state, nr.due
     FROM nodes n
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_review nr ON nr.node_id = n.id
     ORDER BY COALESCE((SELECT position FROM node_order WHERE node_id = n.id), 2147483647),
       n.updated_at DESC, n.created_at DESC, n.id ASC`
  ).all() as ReviewNodeRow[];
  const nodesById = Object.fromEntries(rows.map((row) => [row.id, toPlannerNode(row)]));
  const nodeOrder = rows.map(({ id }) => id);
  const plan = buildReviewQueuePlan({
    newDayStartsAtHour: settings.newDayStartsAtHour,
    nodeOrder,
    nodesById,
    now,
    pushQueueRules: settings.pushQueue,
    trashedNodeIds: rows.filter(({ deleted_at }) => Boolean(deleted_at)).map(({ id }) => id)
  });
  const fsrsNodeId = plan.fsrsQueueNodeIds[0] ?? null;
  const readingNodeIds = plan.readingQueueNodeIds.slice(0, 3);
  const value = {
    fsrsNodeId,
    readingNodeIds,
    required: { fsrs: 1, reading: 3 },
    source: 'shared_review_planner'
  };
  return fsrsNodeId && readingNodeIds.length === 3
    ? { status: 'available' as const, value }
    : {
        error: `review acceptance data is insufficient: fsrs=${fsrsNodeId ? 1 : 0}, reading=${readingNodeIds.length}, required=1+3`,
        status: 'invalid' as const,
        value
      };
}
