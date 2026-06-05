import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SettingsSection } from '../../../../shared/ui';
import { useReviewSchedulerSettings } from '../../context/ReviewSchedulerSettingsProvider';

import { PushQueueRows, SchedulerCoreRows } from './SettingsReviewRows';

export function SettingsReviewSection() {
  const t = useTranslation();
  const reviewSettings = useReviewSchedulerSettings();
  const { reviewSchedulerSettings } = reviewSettings;

  return (
    <SettingsSection ariaLabel={t('settings.review.sectionAria')} title={t('settings.review.section')}>
      <SchedulerCoreRows
        desiredRetention={reviewSchedulerSettings.desiredRetention}
        maximumIntervalDays={reviewSchedulerSettings.maximumIntervalDays}
        newDayStartsAtHour={reviewSchedulerSettings.newDayStartsAtHour}
        onDesiredRetentionChange={reviewSettings.onDesiredRetentionChange}
        onMaximumIntervalDaysChange={reviewSettings.onMaximumIntervalDaysChange}
        onNewDayStartsAtHourChange={reviewSettings.onNewDayStartsAtHourChange}
      />
      <PushQueueRows
        defaultPriority={reviewSchedulerSettings.pushQueue.defaultPriority}
        onDefaultPriorityChange={reviewSettings.onDefaultPriorityChange}
        onPriorityRatioChange={reviewSettings.onPriorityRatioChange}
        onQueueMixRatioFsrsChange={reviewSettings.onQueueMixRatioFsrsChange}
        onQueueMixRatioReadingChange={reviewSettings.onQueueMixRatioReadingChange}
        onReadingInitialIntervalDaysChange={reviewSettings.onReadingInitialIntervalDaysChange}
        onReadingIntervalGrowthFactorMaxChange={reviewSettings.onReadingIntervalGrowthFactorMaxChange}
        onReadingIntervalGrowthFactorMinChange={reviewSettings.onReadingIntervalGrowthFactorMinChange}
        priorityRatio={reviewSchedulerSettings.pushQueue.priorityRatio}
        queueMixRatioFsrs={reviewSchedulerSettings.pushQueue.queueMixRatio.fsrs}
        queueMixRatioReading={reviewSchedulerSettings.pushQueue.queueMixRatio.reading}
        readingInitialIntervalMs={reviewSchedulerSettings.pushQueue.readingInitialIntervalMs}
        readingIntervalGrowthFactorMax={reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.max}
        readingIntervalGrowthFactorMin={reviewSchedulerSettings.pushQueue.readingIntervalGrowthFactorRange.min}
      />
    </SettingsSection>
  );
}
