/** Short fields keep their natural height; overflowing peers share the remaining viewport. */
export function allocateItemEditHeight(available: number, question: number, answer: number): [number, number] {
  const height = Math.max(0, available);
  if (question + answer <= height) return [question, answer];
  const half = height / 2;
  if (question < half) return [question, height - question];
  if (answer < half) return [height - answer, answer];
  return [half, half];
}
