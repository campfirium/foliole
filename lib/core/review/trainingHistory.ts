import type { ReviewTrainingEvent } from './trainingModel.js';

export interface TrainingHistory {
  ratings: Uint32Array;
  deltas: Float64Array;
  times: number[];
}

export function prepareTrainingHistory(events: readonly ReviewTrainingEvent[]) {
  const histories: TrainingHistory[] = [];
  const current = new Map<string, Array<{ rating: number; time: number }>>();
  const append = (reviews: Array<{ rating: number; time: number }>) => {
    if (!reviews.length) return;
    histories.push({ ratings: Uint32Array.from(reviews.map(review => review.rating)),
      times: reviews.map(review => review.time),
      deltas: Float64Array.from(reviews.map((review, index) => index === 0 ? 0 :
        Math.max(0, review.time - reviews[index - 1]!.time) / 86400000)) });
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

/** Convert real events to the upstream CSV without constructing quadratic history prefixes in JS. */
export function trainingReviewCsv(histories: readonly TrainingHistory[], cutoff: number) {
  const rows = histories.flatMap((history, card) => history.times.flatMap((time, index) => time < cutoff
    ? [`${time},${card},${history.ratings[index]},0,${index === 0 ? 0 : 2}`] : []));
  return ['review_time,card_id,review_rating,review_duration,review_state', ...rows].join('\n');
}
