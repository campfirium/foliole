const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

type TopicPostponeReading = { intervalDurationMs: number; lastHandledAt: string | null };

export function resolveTopicPostponeDaysNextAt(days: number, now: string, reading: TopicPostponeReading) {
  if (!Number.isSafeInteger(days) || days < 0) return null;
  if (days === 0) return resolveTopicPostponeDelayNextAt({ level: 0, now, reading });
  const due = new Date(Date.parse(now) + days * DAY_MS);
  return Number.isFinite(due.getTime()) ? due.toISOString() : null;
}

export const TOPIC_POSTPONE_DELAY_OPTIONS = [
  { level: 0, label: '0 weeks', shortLabel: '0W', delayMs: 0 },
  { level: 1, label: '1 week', shortLabel: '1W', delayMs: WEEK_MS },
  { level: 2, label: '2 weeks', shortLabel: '2W', delayMs: 2 * WEEK_MS },
  { level: 3, label: '3 weeks', shortLabel: '3W', delayMs: 3 * WEEK_MS },
  { level: 4, label: '4 weeks', shortLabel: '4W', delayMs: 4 * WEEK_MS },
  { level: 5, label: '5 weeks', shortLabel: '5W', delayMs: 5 * WEEK_MS },
  { level: 6, label: '6 weeks', shortLabel: '6W', delayMs: 6 * WEEK_MS },
  { level: 7, label: '7 weeks', shortLabel: '7W', delayMs: 7 * WEEK_MS },
  { level: 8, label: '8 weeks', shortLabel: '8W', delayMs: 8 * WEEK_MS },
  { level: 9, label: '9 weeks', shortLabel: '9W', delayMs: 9 * WEEK_MS }
] as const;

export type TopicPostponeDelayLevel = (typeof TOPIC_POSTPONE_DELAY_OPTIONS)[number]['level'];

function parseTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeTopicPostponeDelayLevel(value: number): TopicPostponeDelayLevel {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 9) return 9;
  return rounded as TopicPostponeDelayLevel;
}

export function getTopicPostponeDelayOption(level: number) {
  return TOPIC_POSTPONE_DELAY_OPTIONS[normalizeTopicPostponeDelayLevel(level)];
}

export function resolveTopicPostponeDelayNextAt(args: {
  level: number;
  now: string;
  reading: TopicPostponeReading;
}) {
  const nowMs = parseTime(args.now) ?? Date.now();
  const option = getTopicPostponeDelayOption(args.level);
  if (option.level > 0) {
    return new Date(nowMs + option.delayMs).toISOString();
  }
  const lastHandledAtMs = parseTime(args.reading.lastHandledAt) ?? nowMs;
  const naturalDueAtMs = lastHandledAtMs + args.reading.intervalDurationMs;
  return new Date(Math.max(nowMs, naturalDueAtMs)).toISOString();
}
