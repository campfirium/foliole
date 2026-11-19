export const flowGradeStages = [
  'editor-context', 'editor-flush-unavailable', 'editor-flush-rejected', 'editor-flush-error',
  'editor-context-changed', 'prepare-day', 'review-context', 'learning-context', 'not-review-item',
  'not-due', 'scheduler', 'history-admission', 'persist-rejected', 'persist-error',
  'projection', 'projection-rejected'
] as const;

export type FlowGradeStage = typeof flowGradeStages[number];
type Grade = 1 | 2 | 3 | 4;

const splitTopicStages = [
  'source-ineligible', 'draft-save-failed', 'dialog-requested', 'source-unavailable',
  'dialog-opened', 'preferences-load-failed', 'confirmed', 'saved',
  'preferences-save-failed', 'confirm-failed', 'canceled'
] as const;

export type SplitTopicRecordingDetail =
  | { event: 'split.topic.clicked'; inFlow: boolean; enabled: boolean }
  | { event: 'split.topic.stage'; stage: typeof splitTopicStages[number] }
  | { event: 'split.topic.preview'; delimiter: 'empty' | 'unmatched' | 'matched'; parts: number };

export type SupportRecordingEntry = { attempt: number } & (
  | { event: 'flow.grade.selected'; grade: Grade; card: number | null }
  | { event: 'flow.grade.saved'; grade: Grade; card: number; dueAtMs: number | null; reviewedAtMs: number; nextCard: number | null }
  | { event: 'flow.grade.finished'; accepted: boolean; stage: FlowGradeStage | null }
  | { event: 'flow.grade.displayed'; card: number | null }
  | SplitTopicRecordingDetail
);

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

function isGrade(value: unknown): value is Grade {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isCard(value: unknown): value is number | null {
  return value === null || isCounter(value);
}

function isStage(value: unknown): value is FlowGradeStage | null {
  return value === null || flowGradeStages.some(stage => stage === value);
}

function readSplitTopicRecordingEntry(input: Record<string, unknown>, attempt: number): SupportRecordingEntry | undefined {
  const { event, inFlow, enabled, stage, delimiter, parts } = input;
  if (event === 'split.topic.clicked' && typeof inFlow === 'boolean' && typeof enabled === 'boolean')
    return { event, attempt, inFlow, enabled };
  if (event === 'split.topic.stage') {
    const knownStage = splitTopicStages.find(value => value === stage);
    if (knownStage) return { event, attempt, stage: knownStage };
  }
  if (event === 'split.topic.preview' && (delimiter === 'empty' || delimiter === 'unmatched' || delimiter === 'matched')
      && typeof parts === 'number' && Number.isSafeInteger(parts) && parts >= 0)
    return { event, attempt, delimiter, parts };
}

// Rebuild each entry field by field at the host boundary. Never serialize the caller's object.
export function readSupportRecordingEntry(input: unknown): SupportRecordingEntry | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const { event, attempt, grade, card, dueAtMs, reviewedAtMs, nextCard, accepted, stage } =
    input as Record<string, unknown>;
  if (!isCounter(attempt)) return;
  if (event === 'flow.grade.selected' && isGrade(grade) && isCard(card)) return { event, attempt, grade, card };
  if (event === 'flow.grade.saved' && isGrade(grade) && isCounter(card) && (dueAtMs === null || isTime(dueAtMs)) &&
      isTime(reviewedAtMs) && isCard(nextCard)) return { event, attempt, grade, card, dueAtMs, reviewedAtMs, nextCard };
  if (event === 'flow.grade.finished' && typeof accepted === 'boolean' && isStage(stage))
    return { event, attempt, accepted, stage };
  if (event === 'flow.grade.displayed' && isCard(card)) return { event, attempt, card };
  return readSplitTopicRecordingEntry(input as Record<string, unknown>, attempt);
}
