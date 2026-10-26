import type { ReviewTrainingEvent } from './trainingModel.js';

export interface TrainingHistory {
  ratings: Uint32Array;
  deltas: Uint32Array;
  times: number[];
}

export function prepareTrainingHistory(events: readonly ReviewTrainingEvent[]) {
  const histories: TrainingHistory[] = [];
  const current = new Map<string, Array<{ rating: number; time: number }>>();
  const append = (reviews: Array<{ rating: number; time: number }>) => {
    if (!reviews.length) return;
    histories.push({ ratings: Uint32Array.from(reviews.map(review => review.rating)),
      times: reviews.map(review => review.time),
      deltas: Uint32Array.from(reviews.map((review, index) => index === 0 ? 0 :
        Math.floor(review.time / 86400000) - Math.floor(reviews[index - 1]!.time / 86400000))) });
  };
  const ordered = [...events].sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt)
    || (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0));
  for (const event of ordered) {
    const time = Date.parse(event.reviewedAt);
    if (!Number.isFinite(time)) throw new Error('review_training_timestamp_invalid');
    const reviews = current.get(event.nodeId) ?? [];
    if (event.kind === 'reset') { append(reviews); current.set(event.nodeId, []); }
    else {
      if (![1, 2, 3, 4].includes(event.grade)) throw new Error('review_training_grade_invalid');
      reviews.push({ rating: event.grade, time }); current.set(event.nodeId, reviews);
    }
  }
  for (const reviews of current.values()) append(reviews);
  return histories;
}

export function reviewTrainingCutoff(events: readonly ReviewTrainingEvent[]) {
  const times = events.filter(event => event.kind === 'review').map(event => Date.parse(event.reviewedAt)).sort((a, b) => a - b);
  return times[Math.floor(times.length * 0.8)] ?? Infinity;
}

/** Pass original rows to wasm; it constructs history prefixes without a JS-side quadratic expansion. */
export function trainingAnkiArrays(histories: readonly TrainingHistory[], cutoff: number) {
  const rows = histories.flatMap((history, card) => history.times.flatMap((time, index) =>
    time < cutoff ? [{ card: BigInt(card + 1), grade: history.ratings[index]!, time: BigInt(time), type: index === 0 ? 0 : 1 }] : []));
  return { cids: BigInt64Array.from(rows.map(row => row.card)), eases: Uint8Array.from(rows.map(row => row.grade)),
    ids: BigInt64Array.from(rows.map(row => row.time)), types: Uint8Array.from(rows.map(row => row.type)) };
}
