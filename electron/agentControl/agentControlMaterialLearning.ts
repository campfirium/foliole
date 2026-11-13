import { readWorkspaceNodeLearning } from '../../lib/core/database/workspaceNodeLearning.js';
import { openDatabaseConnection } from '../database/connection.js';

type LearningSettings = {
  priority: number | null;
  shelved_at: string | null;
  desired_retention: number | null;
  enable_short_term: number | null;
  initial_review_due: string | null;
};

export function readAgentControlMaterialLearning(id: string, kind: string) {
  if (kind !== 'topic' && kind !== 'item') return null;
  const { driver } = openDatabaseConnection();
  const settings = driver.queryOne<LearningSettings>(
    'SELECT priority, shelved_at, desired_retention, enable_short_term, initial_review_due FROM nodes WHERE id = ?', [id]
  );
  if (!settings) return null;

  const [learning] = readWorkspaceNodeLearning(driver, [id]);
  const common = { priority: settings.priority, shelved_at: settings.shelved_at };
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
