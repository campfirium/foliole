import { parseStoredAnchorLink } from '../database/anchorLinkCodec.js';
import { toReadingProfile, toReviewProfile, type WorkspaceLearningProfileRow } from '../database/workspaceLearningProfiles.js';
import { isNodeKind } from '../nodes/nodeKind.js';
import type { PriorityIndexNode } from '../nodes/workspaceNodePriorityState.js';
import type { DbPort, DbRow } from '../sync/dbPort.js';

import type { DailyFlowLearningNode, DailyFlowLearningSnapshot } from './dailyFlowContract.js';

interface LearningRow extends DbRow {
  id: string;
  parent_id?: string | null;
  kind?: string | null;
  priority?: number | null;
  shelved_at?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  anchor_link?: string | null;
  has_content?: number;
  has_reveal?: number;
}

type NodeMetadata = ReadonlyMap<string, Readonly<PriorityIndexNode>>;
const CONTENT_COLUMNS = `CASE WHEN n.body_blob_hash IS NOT NULL OR LENGTH(TRIM(n.content)) > 0 THEN 1 ELSE 0 END AS has_content,
    CASE WHEN n.reveal IS NOT NULL THEN 1 ELSE 0 END AS has_reveal`;
const ANCHOR_COLUMN = `CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE n.anchor_link END AS anchor_link`;
const NODE_COLUMNS = `n.id, n.parent_id, n.priority, n.created_at, n.deleted_at, n.kind, n.shelved_at, ${CONTENT_COLUMNS}, ${ANCHOR_COLUMN}`;
const PREPARED_NODE_COLUMNS = 'n.id';
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
// Prepared metadata belongs to the same serialized database operation as this read.
export async function loadDailyFlowLearningSnapshot(db: DbPort, hostName: string,
  nodeIds?: readonly string[], metadata?: NodeMetadata): Promise<DailyFlowLearningSnapshot> {
  if (nodeIds) {
    const rows = await db.query<LearningRow & ProfileRow>(`SELECT ${NODE_COLUMNS}, ${PROFILE_COLUMNS}
      ${PROFILE_JOINS} WHERE n.id IN (SELECT value FROM json_each(?))`, [hostName, JSON.stringify(nodeIds)]);
    return buildSnapshot(rows, new Map(rows.map(row => [row.id, row])), [...nodeIds]);
  }
  return db.transaction(async tx => {
    const rows = await tx.query<LearningRow>(`SELECT ${metadata ? PREPARED_NODE_COLUMNS : NODE_COLUMNS} FROM nodes n`);
    return buildSnapshot(rows, await readLearningProfiles(tx, hostName), rows.map(row => row.id), metadata);
  });
}

// The library owner supplies its complete index inside the same serialized database operation.
// Arbitrary metadata views must use the ordinary snapshot reader and its database membership check.
export function loadDailyFlowLearningFromNodeIndex(db: DbPort, hostName: string,
  metadata: NodeMetadata): Promise<DailyFlowLearningSnapshot> {
  return db.transaction(async tx => {
    const profiles = await readLearningProfiles(tx, hostName);
    for (const id of profiles.keys()) if (!metadata.has(id)) throw new Error('daily_flow_node_metadata_missing');
    const rows = Array.from(metadata.keys(), id => ({ id }));
    return buildSnapshot(rows, profiles, rows.map(row => row.id), metadata);
  });
}

async function readLearningProfiles(db: DbPort, hostName: string) {
  const profiles = await db.query<ProfileRow>(`WITH learned AS (
    SELECT node_id FROM node_reading UNION SELECT node_id FROM node_review
  ) SELECT n.id, ${PROFILE_COLUMNS}
    FROM learned INNER JOIN nodes n ON n.id = learned.node_id
    LEFT JOIN node_reading rd ON rd.node_id = n.id
    LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
    LEFT JOIN node_review nr ON nr.node_id = n.id`, [hostName]);
  return new Map(profiles.map(row => [row.id, row]));
}

function buildSnapshot(rows: LearningRow[], profiles: Map<string, ProfileRow>, nodeOrder: string[], metadata?: NodeMetadata): DailyFlowLearningSnapshot {
  const nodesById = Object.fromEntries(rows.map(row => [row.id, learningNode(row, profiles.get(row.id), metadata)]));
  return { nodeOrder, nodesById, trashedNodeIds: rows.filter(row => nodesById[row.id]?.deletedAt).map(row => row.id) };
}

function learningNode(row: LearningRow, profile?: ProfileRow, metadata?: NodeMetadata): DailyFlowLearningNode {
  const cached = metadata?.get(row.id);
  const parentNodeId = cached ? cached.parentNodeId : row.parent_id;
  const createdAt = cached ? cached.createdAt : row.created_at;
  if ((metadata && (!cached || cached.kind === undefined || cached.shelvedAt === undefined
    || typeof cached.hasContent !== 'boolean' || typeof cached.hasReveal !== 'boolean' || cached.anchorKind === undefined))
    || parentNodeId === undefined || typeof createdAt !== 'string') {
    throw new Error('daily_flow_node_metadata_missing');
  }
  const kind = cached ? cached.kind : row.kind;
  const shelvedAt = (cached ? cached.shelvedAt : row.shelved_at) ?? null;
  const anchorKind = cached ? cached.anchorKind : parseStoredAnchorLink(row.anchor_link ?? null)?.kind ?? null;
  return { id: row.id, parentNodeId, kind: isNodeKind(kind) ? kind : 'topic',
    priority: (cached ? cached.priority : row.priority) ?? null, shelvedAt, createdAt,
    deletedAt: (cached ? cached.deletedAt : row.deleted_at) ?? null,
    hasContent: cached ? cached.hasContent! : row.has_content === 1,
    hasReveal: cached ? cached.hasReveal! : row.has_reveal === 1,
    anchorLink: anchorKind ? { kind: anchorKind } : null,
    reading: profile ? toReadingProfile(profile) : null, review: profile ? toReviewProfile(profile) : null };
}
