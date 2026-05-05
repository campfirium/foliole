import type { DatabaseDriver, DatabaseRow } from './driver.js';

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

interface WorkspaceReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: 'active' | 'done' | 'dismissed';
}

interface WorkspaceNodeSnapshot {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  desiredRetention?: number | null;
  title: string;
  isTitleManual: boolean;
  hideTitleHeading: boolean;
  content: string;
  reveal: string | null;
  anchorLink: WorkspaceAnchorLink | null;
  reading: WorkspaceReadingProfile | null;
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

interface WorkspaceNodeRow extends DatabaseRow {
  id: string;
  parent_id: string | null;
  priority: number | null;
  desired_retention: number | null;
  title: string;
  is_title_manual: number;
  hide_title_heading: number;
  content: string;
  reveal: string | null;
  anchor_link: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reading_interval_duration_ms: number | null;
  reading_interval_growth_factor: number | null;
  reading_last_handled_at: string | null;
  reading_next_at: string | null;
  reading_priority: number | null;
  reading_position: number | null;
  reading_repetition_count: number | null;
  reading_state: string | null;
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

interface NodeOrderRow extends DatabaseRow {
  node_id: string;
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
    return { id: parsed.id, kind: parsed.kind };
  } catch {
    return null;
  }
}

function toReadingProfile(row: WorkspaceNodeRow): WorkspaceReadingProfile | null {
  if (typeof row.reading_last_handled_at !== 'string' || typeof row.reading_next_at !== 'string') {
    return null;
  }
  if (row.reading_state !== 'active' && row.reading_state !== 'done' && row.reading_state !== 'dismissed') {
    return null;
  }
  return {
    intervalDurationMs: row.reading_interval_duration_ms ?? 0,
    intervalGrowthFactor: row.reading_interval_growth_factor ?? 1,
    lastHandledAt: row.reading_last_handled_at,
    nextAt: row.reading_next_at,
    priority: row.reading_priority ?? 0,
    readingPosition: row.reading_position ?? 0,
    repetitionCount: row.reading_repetition_count ?? 0,
    state: row.reading_state
  };
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

function queryWorkspaceRows(driver: DatabaseDriver): WorkspaceNodeRow[] {
  return driver.queryAll<WorkspaceNodeRow>(
    `SELECT
       n.id,
       n.parent_id,
       n.priority,
       n.desired_retention,
       n.title,
       n.is_title_manual,
       n.hide_title_heading,
       n.content,
       n.reveal,
       n.anchor_link,
       n.created_at,
       n.updated_at,
       n.deleted_at,
       rd.interval_duration_ms AS reading_interval_duration_ms,
       rd.interval_growth_factor AS reading_interval_growth_factor,
       rd.last_handled_at AS reading_last_handled_at,
       rd.next_at AS reading_next_at,
       rd.priority AS reading_priority,
       rd.reading_position AS reading_position,
       rd.repetition_count AS reading_repetition_count,
       rd.state AS reading_state,
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
     LEFT JOIN node_reading rd ON rd.node_id = n.id
     LEFT JOIN node_review nr ON nr.node_id = n.id`
  );
}

function queryNodeOrderRows(driver: DatabaseDriver): NodeOrderRow[] {
  return driver.queryAll<NodeOrderRow>('SELECT node_id FROM node_order ORDER BY position ASC');
}

function buildSnapshotRows(rows: WorkspaceNodeRow[], orderedRows: NodeOrderRow[]): WorkspaceSnapshot {
  const nodesById: Record<string, WorkspaceNodeSnapshot> = {};
  const trashedNodeIds: string[] = [];

  for (const row of rows) {
    const node: WorkspaceNodeSnapshot = {
      id: row.id,
      parentNodeId: row.parent_id,
      title: row.title,
      isTitleManual: row.is_title_manual === 1,
      hideTitleHeading: row.hide_title_heading === 1,
      content: row.content,
      reveal: row.reveal,
      anchorLink: parseAnchorLink(row.anchor_link),
      reading: toReadingProfile(row),
      review: toReviewProfile(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    if (typeof row.priority === 'number') {
      node.priority = row.priority;
    }
    if (typeof row.desired_retention === 'number') {
      node.desiredRetention = row.desired_retention;
    }
    nodesById[row.id] = node;
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

export function loadWorkspaceSnapshot(driver: DatabaseDriver): WorkspaceSnapshot | null {
  const rows = queryWorkspaceRows(driver);
  if (rows.length === 0) {
    return null;
  }
  return buildSnapshotRows(rows, queryNodeOrderRows(driver));
}
