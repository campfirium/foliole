import type {
  SchedulerCard,
  SchedulerGradeInput,
  SchedulerGradeResult,
  SchedulerPreviewInput,
  SchedulerPreviewResult
} from './types.js';

const TIMESTAMP_TZ_PATTERN = /(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP_TZ_PATTERN.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function assertNonNegativeInteger(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid scheduler field "${field}": expected non-negative integer`);
  }
}

function assertReviewState(value: unknown, field: string): asserts value is 0 | 1 | 2 | 3 {
  if (value !== 0 && value !== 1 && value !== 2 && value !== 3) {
    throw new Error(`Invalid scheduler field "${field}": expected 0 | 1 | 2 | 3`);
  }
}

function assertNonNegativeNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid scheduler field "${field}": expected non-negative number`);
  }
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (!isIsoTimestamp(value)) {
    throw new Error(`Invalid scheduler field "${field}": expected RFC3339 timestamp`);
  }
}

function assertOptionalBoolean(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`Invalid scheduler field "${field}": expected boolean`);
  }
}

export function assertSchedulerCard(value: unknown, field = 'card'): asserts value is SchedulerCard {
  if (!isRecord(value)) {
    throw new Error(`Invalid scheduler field "${field}": expected object`);
  }

  assertTimestamp(value.due, `${field}.due`);
  if (value.last_review !== null) {
    assertTimestamp(value.last_review, `${field}.last_review`);
  }

  assertReviewState(value.state, `${field}.state`);
  assertNonNegativeNumber(value.stability, `${field}.stability`);
  assertNonNegativeNumber(value.difficulty, `${field}.difficulty`);
  assertNonNegativeInteger(value.elapsed_days, `${field}.elapsed_days`);
  assertNonNegativeInteger(value.scheduled_days, `${field}.scheduled_days`);
  assertNonNegativeInteger(value.reps, `${field}.reps`);
  assertNonNegativeInteger(value.lapses, `${field}.lapses`);
}

export function assertSchedulerGradeInput(input: SchedulerGradeInput): void {
  assertSchedulerCard(input.card, 'card');
  assertOptionalBoolean(input.enableShortTerm, 'enableShortTerm');
  assertTimestamp(input.now, 'now');
  if (input.grade !== 1 && input.grade !== 2 && input.grade !== 3 && input.grade !== 4) {
    throw new Error('Invalid scheduler field "grade": expected 1 | 2 | 3 | 4');
  }
}

export function assertSchedulerGradeResult(value: unknown): asserts value is SchedulerGradeResult {
  if (!isRecord(value)) {
    throw new Error('Invalid review grade response: expected object');
  }
  assertSchedulerCard(value.card, 'card');
  assertTimestamp(value.reviewed_at, 'reviewed_at');
}

export function assertSchedulerPreviewInput(input: SchedulerPreviewInput): void {
  assertSchedulerCard(input.card, 'card');
  assertOptionalBoolean(input.enableShortTerm, 'enableShortTerm');
  assertTimestamp(input.now, 'now');
}

export function assertSchedulerPreviewResult(value: unknown): asserts value is SchedulerPreviewResult {
  if (!isRecord(value)) {
    throw new Error('Invalid review preview response: expected object');
  }
  assertSchedulerGradeResult(value.Again);
  assertSchedulerGradeResult(value.Hard);
  assertSchedulerGradeResult(value.Good);
  assertSchedulerGradeResult(value.Easy);
}
