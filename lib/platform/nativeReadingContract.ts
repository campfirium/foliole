import type { ReadingState } from '../core/review/readingState.js';

export interface NativeWorkspaceReadingProfile {
  intervalDurationMs: number;
  intervalGrowthFactor: number;
  lastHandledAt: string;
  nextAt: string;
  priority: number;
  readingPosition: number;
  repetitionCount: number;
  state: ReadingState;
}
