import type { ReviewTrainingEvent } from './trainingModel.js';

export function trainingEvents(count = 2048): ReviewTrainingEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const card = Math.floor(index / 16);
    const review = index % 16;
    return { nodeId: card === 0 ? 'topic' : `training-${card}`, opId: `sample-${index}`,
      reviewedAt: new Date(Date.UTC(2025, 0, 1 + review * 4 + card % 4, 8)).toISOString(),
      grade: ((card * 17 + review * 13) % 10) < 4 ? 1 : 3, kind: 'review' };
  });
}
