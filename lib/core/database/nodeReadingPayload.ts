import type { ReadingState } from '../review/readingState.js';

export interface NodeReadingPayload {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: ReadingState;
}
