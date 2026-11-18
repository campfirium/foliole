export const flowGradeStages = [
  'editor-context', 'editor-flush-unavailable', 'editor-flush-rejected', 'editor-flush-error',
  'editor-context-changed', 'prepare-day', 'review-context', 'learning-context', 'not-review-item',
  'not-due', 'scheduler', 'history-admission', 'persist-rejected', 'persist-error',
  'projection', 'projection-rejected'
] as const;

export type FlowGradeStage = typeof flowGradeStages[number];
type Grade = 1 | 2 | 3 | 4;

export type SupportRecordingEntry = { attempt: number } & (
  | { event: 'flow.grade.selected'; grade: Grade; card: number | null }
  | { event: 'flow.grade.saved'; grade: Grade; card: number; dueAtMs: number | null; reviewedAtMs: number; nextCard: number | null }
  | { event: 'flow.grade.finished'; accepted: boolean; stage: FlowGradeStage | null }
  | { event: 'flow.grade.displayed'; card: number | null }
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
}
