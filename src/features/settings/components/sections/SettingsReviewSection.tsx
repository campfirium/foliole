import { MAX_READING_LATER_DAYS } from '../../../../../lib/core/review/settings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { useReviewSchedulerSettings } from '../../context/ReviewSchedulerSettingsProvider';

import { AdvancedReviewTrainingSettings } from './AdvancedReviewTrainingSettings';
import { ReviewOptimizationRow } from './ReviewOptimizationRow';
import { ReviewNumberInput } from './reviewSettingsControls';
import { PushQueueRows, SchedulerCoreRows } from './SettingsReviewRows';

export function SettingsReviewSection() {
  const t = useTranslation();
  const reviewSettings = useReviewSchedulerSettings();
  const { reviewSchedulerSettings } = reviewSettings;

  return (
    <SettingsSection ariaLabel={t('settings.review.sectionAria')} title={t('settings.review.section')}>
      <ReviewOptimizationRow />
      <SchedulerCoreRows
        desiredRetention={reviewSchedulerSettings.desiredRetention}
        maximumIntervalDays={reviewSchedulerSettings.maximumIntervalDays}
        newDayStartsAtHour={reviewSchedulerSettings.newDayStartsAtHour}
        newItemLoadBalancingDays={reviewSchedulerSettings.newItemLoadBalancingDays}
        onDesiredRetentionChange={reviewSettings.onDesiredRetentionChange}
        onMaximumIntervalDaysChange={reviewSettings.onMaximumIntervalDaysChange}
        onNewDayStartsAtHourChange={reviewSettings.onNewDayStartsAtHourChange}
        onNewItemLoadBalancingDaysChange={reviewSettings.onNewItemLoadBalancingDaysChange}
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
      <SettingsRow data-settings-search-row-id="review-reading-later" title={t('settings.review.later.title')}
        description={t('settings.review.later.description')}>
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <ReviewNumberInput ariaLabel={t('settings.review.later.title')} min={0} max={MAX_READING_LATER_DAYS} step={1}
            value={reviewSchedulerSettings.readingLaterDays ?? 0} onChange={reviewSettings.onReadingLaterDaysChange} />
        </SettingsControlSlot>
      </SettingsRow>
      <AdvancedReviewTrainingSettings />
    </SettingsSection>
  );
}
