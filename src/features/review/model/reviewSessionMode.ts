export type ReviewSessionMode = 'recommended' | 'review-first' | 'reading-only';
export type ReviewSessionModeAvailability = Record<ReviewSessionMode, boolean>;

export const DEFAULT_REVIEW_SESSION_MODE: ReviewSessionMode = 'recommended';

export function isReviewSessionMode(value: unknown): value is ReviewSessionMode {
  return value === 'recommended' || value === 'review-first' || value === 'reading-only';
}
