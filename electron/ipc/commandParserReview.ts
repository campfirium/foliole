import { isReviewTimestamp } from '../../lib/core/review/reviewTimestamp.js';
import type {
  NativeReviewGradeArgs,
  NativeReviewPreviewArgs,
  NativeSchedulerCard
} from '../../lib/platform/nativeContract.js';

import {
  asBoolean,
  asFiniteNumber,
  asIntegerInRange,
  asLiteralUnion,
  asNullableString,
  asTimestamp,
  asString
} from './commandParsers.js';

const REVIEW_RATINGS = ['Again', 'Hard', 'Good', 'Easy'] as const;

function asReviewTimestamp(value: unknown, field: string) {
  const timestamp = asTimestamp(value, field);
  if (!isReviewTimestamp(timestamp)) throw new Error(`invalid argument: ${field}`);
  return timestamp;
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid argument: ${field}`);
  }
  return value as Record<string, unknown>;
}

function asDayInterval(value: unknown, field: string) {
  const days = asFiniteNumber(value, field);
  if (days < 0 || days > Number.MAX_SAFE_INTEGER) throw new Error(`invalid argument: ${field}`);
  return days;
}

function parseSchedulerCard(value: unknown, field: string): NativeSchedulerCard {
  const card = asObject(value, field);
  const lastReview = asNullableString(card.last_review, `${field}.last_review`);
  return {
    due: asReviewTimestamp(card.due, `${field}.due`),
    last_review: lastReview === null ? null : asReviewTimestamp(lastReview, `${field}.last_review`),
    state: asIntegerInRange(card.state, `${field}.state`, 0, 3) as NativeSchedulerCard['state'],
    stability: asFiniteNumber(card.stability, `${field}.stability`),
    ...(card.stability_fast === undefined ? {} : { stability_fast: asFiniteNumber(card.stability_fast, `${field}.stability_fast`) }),
    difficulty: asFiniteNumber(card.difficulty, `${field}.difficulty`),
    elapsed_days: asDayInterval(card.elapsed_days, `${field}.elapsed_days`),
    scheduled_days: asDayInterval(card.scheduled_days, `${field}.scheduled_days`),
    reps: asIntegerInRange(card.reps, `${field}.reps`, 0, Number.MAX_SAFE_INTEGER),
    lapses: asIntegerInRange(card.lapses, `${field}.lapses`, 0, Number.MAX_SAFE_INTEGER)
  };
}

function parseDesiredRetention(value: unknown, field: string) {
  const retention = asFiniteNumber(value, field);
  if (retention < 0.01 || retention > 0.99) throw new Error(`invalid argument: ${field}`);
  return retention;
}

function parseReviewRequest(value: unknown, field: string) {
  const request = asObject(value, field);
  return {
    ...(request.nodeId === undefined ? {} : { nodeId: asString(request.nodeId, `${field}.nodeId`) }),
    card: parseSchedulerCard(request.card, `${field}.card`),
    ...(request.desiredRetention === undefined ? {}
      : { desiredRetention: parseDesiredRetention(request.desiredRetention, `${field}.desiredRetention`) }),
    ...(request.enableShortTerm === undefined
      ? {}
      : { enableShortTerm: asBoolean(request.enableShortTerm, `${field}.enableShortTerm`) }),
    now: asReviewTimestamp(request.now, `${field}.now`)
  };
}

export function parseReviewGradeArgs(args: Record<string, unknown>): NativeReviewGradeArgs {
  const request = parseReviewRequest(args.request, 'request');
  return {
    request: {
      ...request,
      rating: asLiteralUnion(asObject(args.request, 'request').rating, REVIEW_RATINGS, 'request.rating')
    }
  };
}

export function parseReviewPreviewArgs(args: Record<string, unknown>): NativeReviewPreviewArgs {
  return { request: parseReviewRequest(args.request, 'request') };
}
