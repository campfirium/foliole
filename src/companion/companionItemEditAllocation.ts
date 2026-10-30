import { allocateItemAnswerHeight } from '../shared/ui/itemAnswerAllocation';

/** Short fields use the default reading balance; overflowing peers keep their existing allocation. */
export function allocateItemEditHeight(available: number, question: number, answer: number): [number, number] {
  const height = Math.max(0, available);
  if (question + answer <= height) return allocateItemAnswerHeight(height, question, answer);
  const half = height / 2;
  if (question < half) return [question, height - question];
  if (answer < half) return [height - answer, answer];
  return [half, half];
}
