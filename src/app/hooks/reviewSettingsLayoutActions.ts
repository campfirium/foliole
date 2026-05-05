import { normalizeUnifiedPushQueueRules } from '../../features/review/model/unifiedPushQueueRules';
import {
  type ReviewSchedulerSettings,
  type ReviewSchedulerSettingsSavePatch,
  saveReviewSchedulerSettings
} from '../../features/settings/model/reviewSchedulerSettings';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface ReviewSettingsLayoutState {
  reviewSchedulerSettings: ReviewSchedulerSettings;
  setReviewSchedulerSettingsState: (value: ReviewSchedulerSettings) => void;
}

function mergeReviewSchedulerSettings(
  current: ReviewSchedulerSettings,
  patch: ReviewSchedulerSettingsSavePatch
): ReviewSchedulerSettings {
  return {
    ...current,
    ...patch,
    pushQueue: patch.pushQueue
      ? normalizeUnifiedPushQueueRules({
          ...current.pushQueue,
          ...patch.pushQueue,
          queueMixRatio: {
            ...current.pushQueue.queueMixRatio,
            ...(patch.pushQueue.queueMixRatio ?? {})
          },
          readingIntervalGrowthFactorRange: {
            ...current.pushQueue.readingIntervalGrowthFactorRange,
            ...(patch.pushQueue.readingIntervalGrowthFactorRange ?? {})
          }
        })
      : current.pushQueue
  };
}

function createSaveSettings(args: { reviewSettings: ReviewSettingsLayoutState }) {
  return (patch: ReviewSchedulerSettingsSavePatch) => {
    const nextSettings = mergeReviewSchedulerSettings(args.reviewSettings.reviewSchedulerSettings, patch);
    args.reviewSettings.setReviewSchedulerSettingsState(nextSettings);
    void saveReviewSchedulerSettings(patch).then(args.reviewSettings.setReviewSchedulerSettingsState);
  };
}

function createSchedulerSettingActions(saveSettings: (patch: ReviewSchedulerSettingsSavePatch) => void) {
  return {
    onDesiredRetentionChange: (value: number) => {
      saveSettings({ desiredRetention: Number(value.toFixed(2)) });
    },
    onMaximumIntervalDaysChange: (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      saveSettings({ maximumIntervalDays: Math.round(value) });
    },
    onEnableFuzzChange: (value: boolean) => {
      saveSettings({ enableFuzz: value });
    },
    onEnableShortTermChange: (value: boolean) => {
      saveSettings({ enableShortTerm: value });
    }
  };
}

function createGrowthFactorActions(
  saveSettings: (patch: ReviewSchedulerSettingsSavePatch) => void,
  reviewSettings: ReviewSchedulerSettings
) {
  return {
    onReadingIntervalGrowthFactorMinChange: (value: number) => {
      if (!Number.isFinite(value) || value < 1) {
        return;
      }
      const nextMin = Number(value.toFixed(2));
      const currentMax = reviewSettings.pushQueue.readingIntervalGrowthFactorRange.max;
      saveSettings({
        pushQueue: {
          readingIntervalGrowthFactorRange: {
            min: nextMin,
            max: nextMin > currentMax ? nextMin : currentMax
          }
        }
      });
    },
    onReadingIntervalGrowthFactorMaxChange: (value: number) => {
      if (!Number.isFinite(value) || value < 1) {
        return;
      }
      const nextMax = Number(value.toFixed(2));
      const currentMin = reviewSettings.pushQueue.readingIntervalGrowthFactorRange.min;
      saveSettings({
        pushQueue: {
          readingIntervalGrowthFactorRange: {
            min: nextMax < currentMin ? nextMax : currentMin,
            max: nextMax
          }
        }
      });
    }
  };
}

function createPushQueueActions(
  saveSettings: (patch: ReviewSchedulerSettingsSavePatch) => void
) {
  return {
    onDefaultPriorityChange: (value: number) => {
      if (!Number.isFinite(value) || value < 0 || value > 9) {
        return;
      }
      saveSettings({ pushQueue: { defaultPriority: Math.round(value) } });
    },
    onPriorityRatioChange: (value: number) => {
      if (!Number.isFinite(value) || value < 1) {
        return;
      }
      saveSettings({ pushQueue: { priorityRatio: Number(value.toFixed(2)) } });
    },
    onQueueMixRatioReadingChange: (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      saveSettings({ pushQueue: { queueMixRatio: { reading: Math.round(value) } } });
    },
    onQueueMixRatioFsrsChange: (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      saveSettings({ pushQueue: { queueMixRatio: { fsrs: Math.round(value) } } });
    },
    onReadingInitialIntervalDaysChange: (value: number) => {
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      saveSettings({ pushQueue: { readingInitialIntervalMs: Math.round(value * DAY_IN_MS) } });
    }
  };
}

export function createReviewActions(args: { reviewSettings: ReviewSettingsLayoutState }) {
  const saveSettings = createSaveSettings(args);
  return {
    ...createSchedulerSettingActions(saveSettings),
    ...createPushQueueActions(saveSettings),
    ...createGrowthFactorActions(saveSettings, args.reviewSettings.reviewSchedulerSettings)
  };
}
