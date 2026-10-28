import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';
import { toReadingProfile, toReviewProfile, type WorkspaceLearningProfileRow } from '../database/workspaceLearningProfiles.js';
import { isNodeKind } from '../nodes/nodeKind.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import type { DailyFlowLearningNode, DailyFlowLearningSnapshot } from './dailyFlowContract.js';

interface LearningRow extends DbRow {
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

const NODE_COLUMNS = `n.id, n.parent_id, n.kind, n.priority, n.shelved_at,
    n.created_at, n.deleted_at,
    CASE WHEN n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content)) > 0 THEN 1 ELSE 0 END AS has_content,
    CASE WHEN n.reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal,
    CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE n.anchor_link END AS anchor_link`;
const PROFILE_COLUMNS = `    rd.interval_duration_ms AS reading_interval_duration_ms,
    rd.interval_growth_factor AS reading_interval_growth_factor,
    rd.last_handled_at AS reading_last_handled_at, rd.next_at AS reading_next_at,
    rd.priority AS reading_priority, rds.reading_position AS reading_position,
    rd.repetition_count AS reading_repetition_count, rd.state AS reading_state,
    nr.due AS review_due, nr.last_review_at AS review_last_review_at, nr.state AS review_state,
    nr.stability AS review_stability, nr.difficulty AS review_difficulty,
    nr.elapsed_days AS review_elapsed_days, nr.scheduled_days AS review_scheduled_days,
    nr.reps AS review_reps, nr.lapses AS review_lapses`;
const PROFILE_JOINS = `    FROM nodes n
    LEFT JOIN node_reading rd ON rd.node_id = n.id
    LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
    LEFT JOIN node_review nr ON nr.node_id = n.id`;

type ProfileRow = DbRow & WorkspaceLearningProfileRow & { id: string };

// This projection owns learning eligibility and concurrency facts, never workspace display data.
export async function loadDailyFlowLearningSnapshot(db: DbPort, hostName: string,
  nodeIds?: readonly string[]): Promise<DailyFlowLearningSnapshot> {
  if (nodeIds) {
    const rows = await db.query<LearningRow & ProfileRow>(`SELECT ${NODE_COLUMNS}, ${PROFILE_COLUMNS}
      ${PROFILE_JOINS} WHERE n.id IN (SELECT value FROM json_each(?))`, [hostName, JSON.stringify(nodeIds)]);
    return buildSnapshot(rows, new Map(rows.map(row => [row.id, row])), [...nodeIds]);
  }
  return db.transaction(async tx => {
    const rows = await tx.query<LearningRow>(`SELECT ${NODE_COLUMNS} FROM nodes n`);
    const profiles = await tx.query<ProfileRow>(`WITH learned AS (
      SELECT node_id FROM node_reading UNION SELECT node_id FROM node_review
    ) SELECT n.id, ${PROFILE_COLUMNS}
      FROM learned INNER JOIN nodes n ON n.id = learned.node_id
      LEFT JOIN node_reading rd ON rd.node_id = n.id
      LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
      LEFT JOIN node_review nr ON nr.node_id = n.id`, [hostName]);
    return buildSnapshot(rows, new Map(profiles.map(row => [row.id, row])), rows.map(row => row.id));
  });
}

function buildSnapshot(rows: LearningRow[], profiles: Map<string, ProfileRow>, nodeOrder: string[]): DailyFlowLearningSnapshot {
  return { nodeOrder, nodesById: Object.fromEntries(rows.map(row => [row.id, learningNode(row, profiles.get(row.id))])),
    trashedNodeIds: rows.filter(row => row.deleted_at).map(row => row.id) };
}

function learningNode(row: LearningRow, profile?: ProfileRow): DailyFlowLearningNode {
  const anchor = parseStoredAnchorLink(row.anchor_link);
  return { id: row.id, parentNodeId: row.parent_id, kind: isNodeKind(row.kind) ? row.kind : 'topic',
    priority: row.priority, shelvedAt: row.shelved_at, createdAt: row.created_at, deletedAt: row.deleted_at,
    hasContent: row.has_content === 1, hasReveal: row.has_reveal === 1,
    anchorLink: anchor ? { kind: anchor.kind } : null,
    reading: profile ? toReadingProfile(profile) : null, review: profile ? toReviewProfile(profile) : null };
}
