import { isReadingState } from '../review/readingState.js';

import type { WorkspaceNodeRowShape, WorkspaceNodeSnapshot } from './workspaceSnapshotHelpers.js';

export type WorkspaceLearningProfileRow = Pick<WorkspaceNodeRowShape,
  Extract<keyof WorkspaceNodeRowShape, `reading_${string}` | `review_${string}`>>;

export function toReadingProfile(row: WorkspaceLearningProfileRow): WorkspaceNodeSnapshot['reading'] {
  if (typeof row.reading_last_handled_at !== 'string' || typeof row.reading_next_at !== 'string') {
    return null;
  }
  if (!isReadingState(row.reading_state)) {
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

export function toReviewProfile(row: WorkspaceLearningProfileRow): WorkspaceNodeSnapshot['review'] {
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
