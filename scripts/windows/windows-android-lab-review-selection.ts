import type Database from 'better-sqlite3';

import {
  androidBodyStatusExpression,
  androidResolvedContentExpression
} from '../../lib/core/database/androidCompanionDerivedReadSql.ts';
import type { ReviewSchedulerSettings } from '../../lib/core/review/settings.ts';
import { buildReviewQueuePlan, type ReviewQueueNode } from '../../src/store/reviewQueuePlanner.ts';

type Sqlite = InstanceType<typeof Database>;
const BODY_BLOB_DATA = 'CAST(cbd.data AS TEXT)';
const RESOLVED_CONTENT = androidResolvedContentExpression('n.content', BODY_BLOB_DATA);
const BODY_STATUS = androidBodyStatusExpression({
  availabilityExpression: 'cb.availability',
  bodyBlobDataExpression: BODY_BLOB_DATA,
  bodyBlobHashExpression: 'n.body_blob_hash',
  contentExpression: RESOLVED_CONTENT,
  emptyWhenBlank: true
});

interface ReviewNodeRow {
  content: string;
  created_at: string;
  deleted_at: string | null;
  due: string | null;
  has_content: number;
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

type ReviewAcceptanceKind = 'fsrs' | 'reading' | 'unknown';

function toPlannerNode(row: ReviewNodeRow): ReviewQueueNode {
  return {
    content: row.content,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    hasContent: row.has_content === 1,
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

function reviewKind(node: ReviewQueueNode | undefined): ReviewAcceptanceKind {
  if (!node) return 'unknown';
  if (node.review) return 'fsrs';
  if (node.reading) return 'reading';
  return 'unknown';
}

function companionUiQueueNodeIds(plan: ReturnType<typeof buildReviewQueuePlan>) {
  return [...new Set([...plan.queueNodeIds, ...plan.readingQueueNodeIds])];
}

function uiPrefixError(prefixKinds: string[], fsrsNodeId: string | null, readingNodeIds: string[]) {
  const expected = 'fsrs,reading,reading,reading';
  const actual = prefixKinds.join(',') || 'empty';
  return 'review acceptance UI sequence is not ready: ' +
    `actual=${actual}, expected=${expected}, fsrs=${fsrsNodeId ? 1 : 0}, reading=${readingNodeIds.length}`;
}

export function selectReviewAcceptanceObjects(
  db: Sqlite,
  settings: ReviewSchedulerSettings,
  now: string
) {
  const rows = db.prepare(
    `SELECT n.id, n.parent_id, n.kind, n.priority, n.shelved_at,
      COALESCE(${RESOLVED_CONTENT}, '') AS content,
      CASE WHEN ${BODY_STATUS} = 'ready' THEN 1 ELSE 0 END AS has_content,
      n.reveal, n.created_at, n.deleted_at,
      rd.next_at, rd.priority AS reading_priority, rd.state AS reading_state, nr.due
     FROM nodes n
     LEFT JOIN content_blobs cb ON cb.hash = n.body_blob_hash
     LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
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
  const uiQueueNodeIds = companionUiQueueNodeIds(plan);
  const prefixNodeIds = uiQueueNodeIds.slice(0, 4);
  const prefixKinds = prefixNodeIds.map((nodeId) => reviewKind(nodesById[nodeId]));
  const fsrsNodeId = prefixKinds[0] === 'fsrs' ? prefixNodeIds[0] ?? null : null;
  const readingNodeIds = prefixNodeIds.slice(1).filter((nodeId) => reviewKind(nodesById[nodeId]) === 'reading');
  const value = {
    fsrsNodeId,
    readingNodeIds,
    queuePrefix: prefixNodeIds.map((nodeId, index) => ({ itemKind: prefixKinds[index], nodeId })),
    required: { fsrs: 1, reading: 3 },
    source: 'shared_review_planner'
  };
  return fsrsNodeId && readingNodeIds.length === 3 && prefixKinds.join(',') === 'fsrs,reading,reading,reading'
    ? { status: 'available' as const, value }
    : {
        error: uiPrefixError(prefixKinds, fsrsNodeId, readingNodeIds),
        status: 'invalid' as const,
        value
      };
}
