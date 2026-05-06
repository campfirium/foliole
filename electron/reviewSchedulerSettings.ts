import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  createReviewSchedulerParameters,
  getReviewSchedulerVersion,
  mergeReviewSchedulerSettingsPatch,
  normalizeReviewSchedulerSettings,
  type ReviewSchedulerSettings,
  type ReviewSchedulerSettingsSavePatch
} from '../lib/core/review/settings.js';

import { loadJsonSetting, saveJsonSetting } from './database/settingsStore.js';

const REVIEW_SCHEDULER_SETTINGS_KEY = 'review_scheduler_settings';

export function loadReviewSchedulerSettings(): ReviewSchedulerSettings {
  return normalizeReviewSchedulerSettings(loadJsonSetting(REVIEW_SCHEDULER_SETTINGS_KEY));
}

export function saveReviewSchedulerSettings(
  settings: ReviewSchedulerSettingsSavePatch & { updatedAt?: string }
): ReviewSchedulerSettings {
  const now = settings.updatedAt ?? new Date().toISOString();
  const current = loadReviewSchedulerSettings();
  const normalized = mergeReviewSchedulerSettingsPatch(current, { ...settings, updatedAt: now });
  saveJsonSetting(REVIEW_SCHEDULER_SETTINGS_KEY, normalized, now);
  return normalized;
}

export {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  createReviewSchedulerParameters,
  getReviewSchedulerVersion,
  normalizeReviewSchedulerSettings
};
