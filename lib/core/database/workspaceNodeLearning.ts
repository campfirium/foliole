import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { requireDatabaseHostName } from './syncHostIdentity.js';
import { toReadingProfile, toReviewProfile, type WorkspaceLearningProfileRow } from './workspaceLearningProfiles.js';

export interface WorkspaceNodeLearning {
  nodeId: string;
  reading: ReturnType<typeof toReadingProfile>;
  review: ReturnType<typeof toReviewProfile>;
}

/** Reads only requested learning facts; the caller owns this result's lifetime. */
export function readWorkspaceNodeLearning(driver: DatabaseDriver, nodeIds: string[]): WorkspaceNodeLearning[] {
  if (!nodeIds.length) return [];
  return driver.queryAll<DatabaseRow & WorkspaceLearningProfileRow & { id: string }>(`SELECT n.id,
    rd.interval_duration_ms AS reading_interval_duration_ms, rd.interval_growth_factor AS reading_interval_growth_factor,
    rd.last_handled_at AS reading_last_handled_at, rd.next_at AS reading_next_at,
    rd.priority AS reading_priority, rds.reading_position AS reading_position,
    rd.repetition_count AS reading_repetition_count, rd.state AS reading_state,
    nr.due AS review_due, nr.last_review_at AS review_last_review_at, nr.state AS review_state,
    nr.stability AS review_stability, nr.difficulty AS review_difficulty,
    nr.elapsed_days AS review_elapsed_days, nr.scheduled_days AS review_scheduled_days,
    nr.reps AS review_reps, nr.lapses AS review_lapses
    FROM nodes n LEFT JOIN node_reading rd ON rd.node_id=n.id
    LEFT JOIN node_reading_host_state rds ON rds.node_id=n.id AND rds.host_name=?
    LEFT JOIN node_review nr ON nr.node_id=n.id
    WHERE n.id IN (SELECT value FROM json_each(?))`, [requireDatabaseHostName(driver), JSON.stringify(nodeIds)])
    .map(row => ({ nodeId: row.id, reading: toReadingProfile(row), review: toReviewProfile(row) }));
}
