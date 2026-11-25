import type { ReviewDayWindow } from '../reviewReadiness.js';

import type { ReviewQueueNode } from './reviewQueuePlanner.js';

export type ReviewQueueDayWindow = ReviewDayWindow;

/** A shared active day fixes readiness even when the consuming host uses another timezone. */
export function createReviewQueueDayWindow(window: ReviewQueueDayWindow | undefined,
  timestamp: (value: string) => number) {
  const bounds = window ? { start: timestamp(window.start), end: timestamp(window.end) } : undefined;
  return {
    bounds,
    reading(node: ReviewQueueNode, native: string) {
      if (!bounds || !window) return native;
      const dueAt = node.reading?.nextAt ?? node.createdAt;
      const due = timestamp(dueAt);
      if (due >= bounds.start && due < bounds.end) {
        const handled = node.reading?.lastHandledAt ? timestamp(node.reading.lastHandledAt) : due;
        return handled < bounds.start ? window.start : dueAt;
      }
      return due >= bounds.end && timestamp(native) < bounds.end ? window.end : native;
    }
  };
}
