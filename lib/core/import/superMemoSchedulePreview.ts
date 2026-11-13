import { recomputeReview, type ReviewEvent } from '../review/recomputeReview.js';
import type { ReviewSchedulerSettings } from '../review/settings.js';

import { adjustSuperMemoDue, superMemoFullOffset } from './superMemoScheduleOffset.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

export const DEFAULT_SUPER_MEMO_GRADE_MAP = [1, 1, 1, 2, 3, 4] as const;
export type SuperMemoGrade = 1 | 2 | 3 | 4;
export type SuperMemoGradeMap = readonly SuperMemoGrade[];
export const SUPER_MEMO_CONVERSION_RULE_VERSION = 3;

const DAY_MS = 86_400_000;

export function sourceDay(value: string | null) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && asDate(timestamp) === date ? timestamp : null;
}

function asDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function offsetMs(offset: string) {
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  return (offset[0] === '-' ? -1 : 1) * (hours * 60 + minutes) * 60_000;
}

export function sourceCandidate(learning: SuperMemoXmlDraftElement['learning']) {
  if (!learning) return null;
  const last = sourceDay(learning.lastRepetition);
  const days = Number(learning.intervalDays);
  if (last === null || !Number.isSafeInteger(days) || days <= 0 || days > 100_000) return null;
  return asDate(last + days * DAY_MS);
}

export function readReviewEvents(element: SuperMemoXmlDraftElement, sourceOffset: string, gradeMap: SuperMemoGradeMap = DEFAULT_SUPER_MEMO_GRADE_MAP) {
  const events: ReviewEvent[] = [];
  const offset = offsetMs(sourceOffset);
  const history = element.learning?.history ?? [];
  let start = 0;
  for (const [index, event] of history.entries()) {
    if (event.grade === 12 || event.grade === 13) start = index + 1;
  }
  for (let index = start; index < history.length; index++) {
    const event = history[index]!;
    if (index === start && event.grade === 8 && event.repetition === 1 && event.lapses === 0) continue;
    const day = sourceDay(event.date);
    const hour = event.hour === null ? NaN : Number(event.hour);
    const grade = gradeMap[event.grade];
    if (day === null || !Number.isFinite(hour) || hour < 0 || hour >= 24 || grade === undefined) {
      return null;
    }
    events.push({ op_id: String(index).padStart(10, '0'), kind: 'review', voids_op_id: null,
      grade, reviewed_at: new Date(day - offset + Math.round(hour * 3600) * 1000).toISOString() });
  }
  return events;
}

export function blendSuperMemoDue(source: string | null, calculated: string | null, percent: number) {
  return source ? adjustSuperMemoDue(source, superMemoFullOffset(source, calculated), 0, percent) : calculated;
}

export function previewSuperMemoSchedule(
  element: SuperMemoXmlDraftElement,
  sourceOffset: string,
  scheduler: ReviewSchedulerSettings,
  reviewable: boolean,
  gradeMap?: SuperMemoGradeMap
) {
  const item = element.sourceType === 'Item';
  const sourceDue = item || element.sourceType === 'Topic' ? sourceCandidate(element.learning) : null;
  const events = item ? readReviewEvents(element, sourceOffset, gradeMap) : [];
  const card = reviewable && events?.length ? recomputeReview(events, scheduler, String(element.id)) : null;
  return {
    sourceDue,
    recalculatedDue: card ? asDate(Date.parse(card.due) + offsetMs(sourceOffset)) : null,
    replayedCount: card ? events?.length ?? 0 : 0,
    historyNeedsReview: reviewable && item && events === null
  };
}
