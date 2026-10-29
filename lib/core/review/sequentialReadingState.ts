import type { ReadingState } from './readingState.js';
import type { SequentialReadingNode } from './sequentialReadingTypes.js';

export type SequentialReadingStateNode = Omit<SequentialReadingNode, 'reading'> & {
  reading?: { state: ReadingState } | null;
  learningSummary?: { reading: { state: ReadingState; repetitionCount: number } | null };
};
export type SequentialReadingStateNodes = Record<string, SequentialReadingStateNode>;

export function sequentialReadingState(node: SequentialReadingStateNode | undefined): ReadingState | null {
  return node?.reading?.state ?? node?.learningSummary?.reading?.state ?? null;
}
