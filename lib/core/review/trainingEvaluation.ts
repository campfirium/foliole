import { forgetting_curve } from 'ts-fsrs';

import type { TrainingHistory } from './trainingHistory.js';

interface HistoryModel {
  historicalMemoryStates(ratings: Uint32Array, deltas: Uint32Array): Array<{ stability: number }>;
}

// FSRS-rs 6.6 dataset.rs r_matrix_index: interval, long-term review count, and prior lapses.
function bin(value: number, scale: number, base: number) {
  return Math.round(scale * base ** Math.floor(Math.log(value) / Math.log(base)));
}

export function evaluateReviewTraining(model: HistoryModel, weights: number[],
  histories: readonly TrainingHistory[], cutoff: number) {
  const bins = new Map<string, { predicted: number; actual: number; count: number }>();
  let count = 0;
  let loss = 0;
  for (const history of histories) {
    const states = model.historicalMemoryStates(history.ratings, history.deltas);
    let longTerm = 0;
    let lapses = 0;
    for (let index = 1; index < history.times.length; index += 1) {
      const elapsed = history.deltas[index]!;
      if (elapsed > 0) longTerm += 1;
      if (elapsed > 0 && history.times[index]! >= cutoff) {
        const predicted = Math.min(1 - 1e-7, Math.max(1e-7,
          forgetting_curve(weights, elapsed, states[index - 1]!.stability)));
        const actual = history.ratings[index] === 1 ? 0 : 1;
        loss -= actual * Math.log(predicted) + (1 - actual) * Math.log(1 - predicted);
        const key = `${bin(elapsed, 248, 3.62)}:${bin(longTerm + 1, 1.99, 1.89)}:${lapses ? bin(lapses, 1.65, 1.73) : 0}`;
        const group = bins.get(key) ?? { predicted: 0, actual: 0, count: 0 };
        group.predicted += predicted; group.actual += actual; group.count += 1;
        bins.set(key, group); count += 1;
      }
      if (elapsed > 0 && history.ratings[index] === 1) lapses += 1;
    }
  }
  if (!count) return null;
  const squared = [...bins.values()].reduce((sum, group) =>
    sum + ((group.predicted - group.actual) / group.count) ** 2 * group.count, 0);
  return { logLoss: loss / count, rmse: Math.sqrt(squared / count) };
}
