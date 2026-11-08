import { ChevronRight, RotateCcw } from 'lucide-react';

import { DEFAULT_REVIEW_TRAINING_OPTIONS } from '../../../../../lib/core/review/settings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppSwitch, SettingsControlSlot, SettingsRow, settingsResetButtonClassName } from '../../../../shared/ui';
import { useReviewSchedulerSettings } from '../../context/ReviewSchedulerSettingsProvider';

function TrainingOption({ title, description, checked, defaultChecked, disabled, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  defaultChecked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslation();
  const resetLabel = t('settings.review.training.resetOption', { label: title });
  return (
    <SettingsRow title={title} description={description} controlLayout="inline">
      <SettingsControlSlot>
        <button aria-label={resetLabel} title={resetLabel} type="button"
          className={settingsResetButtonClassName()} disabled={disabled || checked === defaultChecked}
          onClick={() => onChange(defaultChecked)}>
          <RotateCcw aria-hidden="true" className="size-4" />
        </button>
        <AppSwitch aria-label={title} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </SettingsControlSlot>
    </SettingsRow>
  );
}

export function AdvancedReviewTrainingSettings() {
  const t = useTranslation();
  const { isReviewSchedulerSettingsReady, reviewSchedulerSettings, onRecencyWeightingChange,
    onReviewIntervalPenaltiesChange } = useReviewSchedulerSettings();
  const defaults = DEFAULT_REVIEW_TRAINING_OPTIONS;
  return (
    <details className="group border-b border-settings-divider/70">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-settings-panel-x py-settings-panel-y text-ui-lg [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 group-open:rotate-90" />
        {t('settings.review.training.title')}
      </summary>
      <p className="px-settings-panel-x pb-2 text-ui-md leading-6 text-foreground/64">{t('settings.review.training.description')}</p>
      <TrainingOption title={t('settings.review.training.recency')}
        description={t('settings.review.training.recencyDescription')}
        checked={reviewSchedulerSettings.recencyWeighting ?? defaults.recencyWeighting}
        defaultChecked={defaults.recencyWeighting} disabled={!isReviewSchedulerSettingsReady}
        onChange={onRecencyWeightingChange} />
      <TrainingOption title={t('settings.review.training.penalties')}
        description={t('settings.review.training.penaltiesDescription')}
        checked={reviewSchedulerSettings.reviewIntervalPenalties ?? defaults.reviewIntervalPenalties}
        defaultChecked={defaults.reviewIntervalPenalties} disabled={!isReviewSchedulerSettingsReady}
        onChange={onReviewIntervalPenaltiesChange} />
    </details>
  );
}
