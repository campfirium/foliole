import type { DbPort, DbRow } from '../sync/dbPort.js';

import { buildWorkspaceSnapshotNode, type WorkspaceNodeRowShape } from './workspaceSnapshotHelpers.js';

export async function loadCompanionWorkspaceNodeFromDb(db: DbPort, nodeId: string, learningHost?: string) {
  const [row] = await db.query<WorkspaceNodeRowShape & DbRow>(
    learningHost ? LEARNING_NODE_SQL : 'SELECT n.* FROM nodes n WHERE n.id = ?',
    learningHost ? [learningHost, nodeId] : [nodeId]
  );
  if (!row) return null;
  const node = buildWorkspaceSnapshotNode(row);
  return node;
}

const LEARNING_NODE_SQL = `SELECT n.*,
  nr.due AS review_due, nr.last_review_at AS review_last_review_at,
  nr.state AS review_state, nr.stability AS review_stability,
  nr.difficulty AS review_difficulty, nr.elapsed_days AS review_elapsed_days,
  nr.scheduled_days AS review_scheduled_days, nr.reps AS review_reps, nr.lapses AS review_lapses,
  rd.interval_duration_ms AS reading_interval_duration_ms,
  rd.interval_growth_factor AS reading_interval_growth_factor,
  rd.last_handled_at AS reading_last_handled_at, rd.next_at AS reading_next_at,
  rd.priority AS reading_priority, rd.repetition_count AS reading_repetition_count,
  rd.state AS reading_state, rds.reading_position AS reading_position
  FROM nodes n LEFT JOIN node_review nr ON nr.node_id = n.id
  LEFT JOIN node_reading rd ON rd.node_id = n.id
  LEFT JOIN node_reading_host_state rds ON rds.node_id = n.id AND rds.host_name = ?
  WHERE n.id = ?`;
