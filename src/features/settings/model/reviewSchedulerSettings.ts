import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  PUSH_QUEUE_SETTINGS_SCOPE,
  getReviewSchedulerSettingsSignature,
  getReviewSchedulerVersion,
  mergeReviewSchedulerSettingsPatch,
  normalizeReviewSchedulerSettings,
  type ReviewSchedulerSettings,
  type ReviewSchedulerSettingsSavePatch
} from '../../../../lib/core/review/settings';
import {
  hasReviewSchedulerSettingsRuntimeRepository,
  loadReviewSchedulerSettingsFromRuntime,
  saveReviewSchedulerSettingsToRuntime
} from '../../../shared/platform/settingsRuntimeRepository';

const settingsListeners = new Set<(hour: number) => void>();

export function subscribeReviewDayBoundary(handler: (hour: number) => void) {
  settingsListeners.add(handler);
  return () => { settingsListeners.delete(handler); };
}

let currentReviewSchedulerSettings = DEFAULT_REVIEW_SCHEDULER_SETTINGS;

export function getCurrentReviewSchedulerSettings() {
  return currentReviewSchedulerSettings;
}

function syncCurrentReviewSchedulerSettings(settings: ReviewSchedulerSettings) {
  const previousHour = currentReviewSchedulerSettings.newDayStartsAtHour;
  currentReviewSchedulerSettings = settings;
  if (previousHour !== settings.newDayStartsAtHour) {
    for (const handler of settingsListeners) handler(settings.newDayStartsAtHour);
  }
  return settings;
}

function isReviewSchedulerSettingsPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  return [
    'algorithm',
    'desiredRetention',
    'maximumIntervalDays',
    'newDayStartsAtHour',
    'newItemLoadBalancingDays',
    'enableShortTerm',
    'pushQueue',
    'updatedAt'
  ].some((key) => Object.hasOwn(payload, key));
}

export function hydrateCurrentReviewSchedulerSettings(payload: unknown) {
  if (!isReviewSchedulerSettingsPayload(payload)) {
    return null;
  }
  return syncCurrentReviewSchedulerSettings(normalizeReviewSchedulerSettings(payload));
}

export async function loadReviewSchedulerSettings(): Promise<ReviewSchedulerSettings> {
  if (!hasReviewSchedulerSettingsRuntimeRepository()) {
    return getCurrentReviewSchedulerSettings();
  }
  try {
    return syncCurrentReviewSchedulerSettings(
      normalizeReviewSchedulerSettings(await loadReviewSchedulerSettingsFromRuntime())
    );
  } catch {
    return syncCurrentReviewSchedulerSettings(DEFAULT_REVIEW_SCHEDULER_SETTINGS);
  }
}

export async function saveReviewSchedulerSettings(
  settings: ReviewSchedulerSettingsSavePatch
): Promise<ReviewSchedulerSettings> {
  const hasRuntime = hasReviewSchedulerSettingsRuntimeRepository();
  const baseSettings = hasRuntime ? await loadReviewSchedulerSettings() : getCurrentReviewSchedulerSettings();
  const payload = mergeReviewSchedulerSettingsPatch(baseSettings, settings);
  syncCurrentReviewSchedulerSettings(payload);
  if (!hasRuntime) {
    return payload;
  }
  try {
    return syncCurrentReviewSchedulerSettings(
      normalizeReviewSchedulerSettings(
        await saveReviewSchedulerSettingsToRuntime(payload)
      )
    );
  } catch {
    return syncCurrentReviewSchedulerSettings(normalizeReviewSchedulerSettings(payload));
  }
}

export {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  PUSH_QUEUE_SETTINGS_SCOPE,
  getReviewSchedulerSettingsSignature,
  getReviewSchedulerVersion
};
export type { ReviewSchedulerSettings, ReviewSchedulerSettingsSavePatch };
