import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';
import { toReadingProfile, toReviewProfile, type WorkspaceLearningProfileRow } from '../database/workspaceLearningProfiles.js';
import { isNodeKind } from '../nodes/nodeKind.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import type { DailyFlowLearningNode, DailyFlowLearningSnapshot } from './dailyFlowContract.js';

interface LearningRow extends DbRow, WorkspaceLearningProfileRow {
  id: string;
  parent_id: string | null;
  kind: string | null;
  priority: number | null;
  shelved_at: string | null;
  created_at: string;
  deleted_at: string | null;
  anchor_link: string | null;
  has_content: number;
  has_reveal: number;
}

// This projection owns learning eligibility and concurrency facts, never workspace display data.
export async function loadDailyFlowLearningSnapshot(db: DbPort, hostName: string,
  nodeIds: readonly string[]): Promise<DailyFlowLearningSnapshot> {
  const rows = await db.query<LearningRow>(`SELECT n.id, n.parent_id, n.kind, n.priority, n.shelved_at,
    n.created_at, n.deleted_at,
    CASE WHEN n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content)) > 0 THEN 1 ELSE 0 END AS has_content,
    CASE WHEN n.reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal,
    CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE n.anchor_link END AS anchor_link,
    rd.interval_duration_ms AS reading_interval_duration_ms,
    rd.interval_growth_factor AS reading_interval_growth_factor,
    rd.last_handled_at AS reading_last_handled_at, rd.next_at AS reading_next_at,
    rd.priority AS reading_priority, rds.reading_position AS reading_position,
    rd.repetition_count AS reading_repetition_count, rd.state AS reading_state,
    nr.due AS review_due, nr.last_review_at AS review_last_review_at, nr.state AS review_state,
    nr.stability AS review_stability, nr.difficulty AS review_difficulty,
    nr.elapsed_days AS review_elapsed_days, nr.scheduled_days AS review_scheduled_days,
    nr.reps AS review_reps, nr.lapses AS review_lapses
    FROM nodes n
    LEFT JOIN node_reading rd ON rd.node_id = n.id
    LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
    LEFT JOIN node_review nr ON nr.node_id = n.id
    WHERE n.id IN (SELECT value FROM json_each(?))`, [hostName, JSON.stringify(nodeIds)]);
  return { nodeOrder: [...nodeIds], nodesById: Object.fromEntries(rows.map(row => [row.id, learningNode(row)])),
    trashedNodeIds: rows.filter(row => row.deleted_at).map(row => row.id) };
}

function learningNode(row: LearningRow): DailyFlowLearningNode {
  const anchor = parseStoredAnchorLink(row.anchor_link);
  return { id: row.id, parentNodeId: row.parent_id, kind: isNodeKind(row.kind) ? row.kind : 'topic',
    priority: row.priority, shelvedAt: row.shelved_at, createdAt: row.created_at, deletedAt: row.deleted_at,
    hasContent: row.has_content === 1, hasReveal: row.has_reveal === 1,
    anchorLink: anchor ? { kind: anchor.kind } : null,
    reading: toReadingProfile(row), review: toReviewProfile(row) };
}
