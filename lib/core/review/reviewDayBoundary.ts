import type { SchedulerCard } from './types.js';

const HOUR_IN_MS = 60 * 60 * 1000;

export const DEFAULT_NEW_DAY_STARTS_AT_HOUR = 4;

export function normalizeNewDayStartsAtHour(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_NEW_DAY_STARTS_AT_HOUR;
  }
  const hour = Math.round(value);
  return hour >= 0 && hour <= 23 ? hour : DEFAULT_NEW_DAY_STARTS_AT_HOUR;
}

export function resolveCurrentDayStart(date: Date, newDayStartsAtHour: number) {
  const hour = normalizeNewDayStartsAtHour(newDayStartsAtHour);
  const shifted = new Date(date.getTime() - hour * HOUR_IN_MS);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate(), hour);
}

export function resolveScheduledDayStart(args: {
  reviewedAt: string;
  scheduledDays: number;
  newDayStartsAtHour: number;
}) {
  const start = resolveCurrentDayStart(new Date(args.reviewedAt), args.newDayStartsAtHour);
  start.setDate(start.getDate() + Math.max(0, Math.round(args.scheduledDays)));
  return start;
}

export function normalizeScheduledCardDue(args: {
  card: SchedulerCard;
  reviewedAt: string;
  newDayStartsAtHour: number;
}): SchedulerCard {
  if (args.card.scheduled_days < 1) {
    return args.card;
  }
  return {
    ...args.card,
    due: resolveScheduledDayStart({
      reviewedAt: args.reviewedAt,
      scheduledDays: args.card.scheduled_days,
      newDayStartsAtHour: args.newDayStartsAtHour
    }).toISOString()
  };
}

export function resolveStoredReviewDueAt(args: {
  due: string;
  scheduledDays: number;
  newDayStartsAtHour: number;
}) {
  if (args.scheduledDays < 1) {
    return args.due;
  }
  const due = new Date(args.due);
  if (Number.isNaN(due.getTime())) {
    return args.due;
  }
  const hour = normalizeNewDayStartsAtHour(args.newDayStartsAtHour);
  return new Date(due.getFullYear(), due.getMonth(), due.getDate(), hour).toISOString();
}
