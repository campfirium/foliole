import type { ApplyReviewGradeInput } from '../database/reviewMutations.js';

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return asString(value, field);
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asIntegerInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value;
}

function asReviewCardSnapshot(value: unknown, field: string): ApplyReviewGradeInput['cardBefore'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  const payload = value as Record<string, unknown>;
  return {
    due: asString(payload.due, `${field}.due`),
    last_review: asNullableString(payload.last_review, `${field}.last_review`),
    state: asIntegerInRange(payload.state, `${field}.state`, 0, 3) as 0 | 1 | 2 | 3,
    stability: asNumber(payload.stability, `${field}.stability`),
    difficulty: asNumber(payload.difficulty, `${field}.difficulty`),
    elapsed_days: asIntegerInRange(payload.elapsed_days, `${field}.elapsed_days`, 0, Number.MAX_SAFE_INTEGER),
    scheduled_days: asIntegerInRange(payload.scheduled_days, `${field}.scheduled_days`, 0, Number.MAX_SAFE_INTEGER),
    reps: asIntegerInRange(payload.reps, `${field}.reps`, 0, Number.MAX_SAFE_INTEGER),
    lapses: asIntegerInRange(payload.lapses, `${field}.lapses`, 0, Number.MAX_SAFE_INTEGER)
  };
}

export function parseApplyReviewGradeArgs(args: Record<string, unknown>): ApplyReviewGradeInput {
  return {
    nodeId: asString(args.nodeId, 'nodeId'),
    grade: asIntegerInRange(args.grade, 'grade', 1, 4) as 1 | 2 | 3 | 4,
    reviewedAt: asString(args.reviewedAt, 'reviewedAt'),
    schedulerVersion: asString(args.schedulerVersion, 'schedulerVersion'),
    cardBefore: asReviewCardSnapshot(args.cardBefore, 'cardBefore'),
    cardAfter: asReviewCardSnapshot(args.cardAfter, 'cardAfter')
  };
}
