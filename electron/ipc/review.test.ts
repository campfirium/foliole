import { expect, it } from 'vitest';

import { reviewPreview } from './review.js';

const NOW = '2026-03-06T00:00:00.000Z';

function createInitialCard() {
  return {
    due: NOW,
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  };
}

it('returns Again/Hard/Good/Easy preview payload for one card', () => {
  const preview = reviewPreview({
    request: {
      card: createInitialCard(),
      now: NOW
    }
  });

  expect(Object.keys(preview)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  expect(preview.Again.reviewed_at).toBe(NOW);
  expect(preview.Hard.reviewed_at).toBe(NOW);
  expect(preview.Good.reviewed_at).toBe(NOW);
  expect(preview.Easy.reviewed_at).toBe(NOW);
  expect(Date.parse(preview.Again.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Hard.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Good.card.due)).not.toBeNaN();
  expect(Date.parse(preview.Easy.card.due)).not.toBeNaN();
});
