import { openDatabaseConnection } from './connection.js';

interface WorkspaceAnchorLink {
  id: string;
  kind: 'highlight' | 'cloze';
}

interface WorkspaceReviewProfile {
  due: string;
  lastReviewAt: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

interface WorkspaceNodeSnapshot {
  id: string;
  parentNodeId: string | null;
  title: string;
  isTitleManual: boolean;
  content: string;
  reveal: string | null;
  anchorLink: WorkspaceAnchorLink | null;
  review: WorkspaceReviewProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSnapshot {
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, WorkspaceNodeSnapshot>;
  trashedNodeIds: string[];
}

interface WorkspaceNodeRow {
  id: string;
  parent_id: string | null;
  title: string;
  is_title_manual: number;
  content: string;
  reveal: string | null;
  anchor_link: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  review_due: string | null;
  review_last_review_at: string | null;
  review_state: number | null;
  review_stability: number | null;
  review_difficulty: number | null;
  review_elapsed_days: number | null;
  review_scheduled_days: number | null;
  review_reps: number | null;
  review_lapses: number | null;
}

function parseAnchorLink(value: string | null): WorkspaceAnchorLink | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; kind?: unknown };
    if (typeof parsed.id !== 'string') {
      return null;
    }
    if (parsed.kind !== 'highlight' && parsed.kind !== 'cloze') {
      return null;
    }
    return {
      id: parsed.id,
      kind: parsed.kind
    };
  } catch {
    return null;
  }
}

function toReviewProfile(row: WorkspaceNodeRow): WorkspaceReviewProfile | null {
  if (typeof row.review_due !== 'string') {
    return null;
  }
  return {
    due: row.review_due,
    lastReviewAt: row.review_last_review_at,
    state: (row.review_state ?? 0) as 0 | 1 | 2 | 3,
    stability: row.review_stability ?? 0,
    difficulty: row.review_difficulty ?? 0,
    elapsedDays: row.review_elapsed_days ?? 0,
    scheduledDays: row.review_scheduled_days ?? 0,
    reps: row.review_reps ?? 0,
    lapses: row.review_lapses ?? 0
  };
}

function queryWorkspaceRows(): WorkspaceNodeRow[] {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT
         n.id,
         n.parent_id,
         n.title,
         n.is_title_manual,
         n.content,
         n.reveal,
         n.anchor_link,
         n.created_at,
         n.updated_at,
         n.deleted_at,
         nr.due AS review_due,
         nr.last_review_at AS review_last_review_at,
         nr.state AS review_state,
         nr.stability AS review_stability,
         nr.difficulty AS review_difficulty,
         nr.elapsed_days AS review_elapsed_days,
         nr.scheduled_days AS review_scheduled_days,
         nr.reps AS review_reps,
         nr.lapses AS review_lapses
       FROM nodes n
       LEFT JOIN node_review nr ON nr.node_id = n.id`
    )
    .all() as WorkspaceNodeRow[];
}

function queryNodeOrderRows(): Array<{ node_id: string }> {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare('SELECT node_id FROM node_order ORDER BY position ASC')
    .all() as Array<{ node_id: string }>;
}

function buildSnapshotRows(rows: WorkspaceNodeRow[], orderedRows: Array<{ node_id: string }>): WorkspaceSnapshot {
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  const trashedNodeIds: string[] = [];

  for (const row of rows) {
    nodesById[row.id] = {
      id: row.id,
      parentNodeId: row.parent_id,
      title: row.title,
      isTitleManual: row.is_title_manual === 1,
      content: row.content,
      reveal: row.reveal,
      anchorLink: parseAnchorLink(row.anchor_link),
      review: toReviewProfile(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    if (row.deleted_at) {
      trashedNodeIds.push(row.id);
    }
  }

  const nodeOrder = orderedRows.map((row) => row.node_id).filter((nodeId) => Boolean(nodesById[nodeId]));
  const orderedNodeIds = new Set(nodeOrder);
  for (const row of rows) {
    if (!orderedNodeIds.has(row.id)) {
      nodeOrder.push(row.id);
    }
  }

  const trashedNodeSet = new Set(trashedNodeIds);
  const activeNodeId = nodeOrder.find((nodeId) => !trashedNodeSet.has(nodeId)) ?? null;

  return {
    activeNodeId,
    nodeOrder,
    nodesById,
    trashedNodeIds
  };
}

export function loadWorkspaceSnapshot(): WorkspaceSnapshot | null {
  const rows = queryWorkspaceRows();
  if (rows.length === 0) {
    return null;
  }
  const orderedRows = queryNodeOrderRows();
  return buildSnapshotRows(rows, orderedRows);
}
