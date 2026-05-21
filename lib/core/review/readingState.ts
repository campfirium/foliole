export const READING_STATES = ['active', 'done', 'dismissed', 'locked'] as const;

export type ReadingState = (typeof READING_STATES)[number];

export function isReadingState(value: unknown): value is ReadingState {
  return typeof value === 'string' && READING_STATES.includes(value as ReadingState);
}
