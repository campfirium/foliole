import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';
import { openDatabaseConnection } from '../database/connection.js';

import type { AgentMaterialReadPayload } from './agentControlMaterials.js';

type LearningSettings = {
  priority: number | null;
  shelved_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  initial_review_due: string | null;
  enforce_priority: number | null;
  virtual_filter: string | null;
};

function readEnforcingAncestor(driver: ReturnType<typeof openDatabaseConnection>['driver'], id: string) {
  const row = driver.queryOne<{ id: string; priority: number }>(
    `WITH RECURSIVE ancestors(id, depth) AS (
       SELECT parent_id, 1 FROM nodes WHERE id = ? AND parent_id IS NOT NULL
       UNION ALL
       SELECT n.parent_id, a.depth + 1 FROM ancestors a JOIN nodes n ON n.id = a.id
       WHERE n.parent_id IS NOT NULL AND a.depth < 1000
     )
     SELECT n.id, n.priority FROM ancestors a JOIN nodes n ON n.id = a.id
     WHERE n.kind = 'folder' AND n.enforce_priority = 1 AND n.priority IS NOT NULL
     ORDER BY a.depth LIMIT 1`, [id]
  );
  return row ? { folder_id: row.id, priority: row.priority } : null;
}

export function readAgentControlMaterialLearning({ id, kind, special_kind }: AgentMaterialReadPayload) {
  if (special_kind || !['folder', 'topic', 'item'].includes(kind)) return null;
  const { driver } = openDatabaseConnection();
  const settings = driver.queryOne<LearningSettings>(
    'SELECT priority, shelved_at, desired_retention, enable_short_term, initial_review_due, enforce_priority, virtual_filter FROM nodes WHERE id = ?', [id]
  );
  if (!settings || settings.virtual_filter) return null;
  const enforced_priority = readEnforcingAncestor(driver, id);
  if (kind === 'folder') {
    return { priority: settings.priority, enforce_priority: settings.enforce_priority === 1, enforced_priority };
  }

  const [learning] = readWorkspaceNodeLearning(driver, [id]);
  const common = { priority: settings.priority, enforced_priority, shelved_at: settings.shelved_at };
  if (kind === 'topic') {
    const reading = learning?.reading;
    return { ...common, reading_schedule: reading ? {
      next_at: reading.nextAt,
      last_handled_at: reading.lastHandledAt,
      interval_duration_ms: reading.intervalDurationMs,
      interval_growth_factor: reading.intervalGrowthFactor,
      repetition_count: reading.repetitionCount,
      state: reading.state,
      priority: reading.priority
    } : null };
  }

  const review = learning?.review;
  return {
    ...common,
    desired_retention: settings.desired_retention,
    enable_short_term: settings.enable_short_term === null ? null : settings.enable_short_term === 1,
    initial_review_due: settings.initial_review_due,
    review_schedule: review ? {
      due: review.due,
      last_review_at: review.lastReviewAt,
      state: review.state,
      stability: review.stability,
      stability_fast: review.stabilityFast,
      difficulty: review.difficulty,
      elapsed_days: review.elapsedDays,
      scheduled_days: review.scheduledDays,
      reps: review.reps,
      lapses: review.lapses
    } : null
  };
}
