import { resolveCurrentDayStart } from '../../lib/core/review/reviewDayBoundary.js';
import {
  DEFAULT_REVIEW_SESSION_MODE,
  isReviewSessionMode,
  type ReviewSessionMode
} from '../features/review/model/reviewSessionMode';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

export interface ReviewSessionModePreferenceState {
  reviewSessionMode: ReviewSessionMode;
  reviewSessionModeExpiresAt: string | null;
}

function isFutureTimestamp(value: string | null, now: string) {
  return Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.parse(now));
}

export function resolveReviewSessionModePreference(
  mode: ReviewSessionMode,
  expiresAt: string | null,
  now: string
): ReviewSessionModePreferenceState {
  if (mode === DEFAULT_REVIEW_SESSION_MODE || !isFutureTimestamp(expiresAt, now)) {
    return {
      reviewSessionMode: DEFAULT_REVIEW_SESSION_MODE,
      reviewSessionModeExpiresAt: null
    };
  }
  return { reviewSessionMode: mode, reviewSessionModeExpiresAt: expiresAt };
}

export function createReviewSessionModePreference(
  mode: ReviewSessionMode,
  now: string
): ReviewSessionModePreferenceState {
  if (mode === DEFAULT_REVIEW_SESSION_MODE) {
    return resolveReviewSessionModePreference(mode, null, now);
  }
  const settings = getCurrentReviewSchedulerSettings();
  const nextDayStart = resolveCurrentDayStart(new Date(now), settings.newDayStartsAtHour);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  return {
    reviewSessionMode: mode,
    reviewSessionModeExpiresAt: nextDayStart.toISOString()
  };
}

export function parsePersistedReviewSessionModePreference(
  mode: unknown,
  expiresAt: unknown
): ReviewSessionModePreferenceState | undefined {
  if (!isReviewSessionMode(mode)) return undefined;
  if (mode === DEFAULT_REVIEW_SESSION_MODE) {
    return { reviewSessionMode: mode, reviewSessionModeExpiresAt: null };
  }
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt))) return undefined;
  return { reviewSessionMode: mode, reviewSessionModeExpiresAt: expiresAt };
}
