import { useState } from 'react';

import { DEFAULT_REVIEW_TRAINING_OPTIONS, type ReviewSchedulerSettingsSavePatch } from '../../lib/core/review/settings';
import type { ReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { saveCompanionReviewSettings } from '../shared/platform/companion/settings/companionReviewSchedulerSettingsRepository';
import { AppSwitch } from '../shared/ui';

import { CompanionSettingRow } from './CompanionSettingRow';

/** Mirrors desktop advanced training switches; both live in the shared scheduler settings record. */
export function CompanionReviewTrainingOptions({ settings }: { settings: ReviewSchedulerSettings }) {
  const t = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = (patch: ReviewSchedulerSettingsSavePatch) => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    void saveCompanionReviewSettings(patch).catch(() => setFailed(true)).finally(() => setSaving(false));
  };
  const recency = t('settings.review.training.recency');
  const penalties = t('settings.review.training.penalties');
  return <>
    <CompanionSettingRow title={recency} description={t('settings.review.training.recencyDescription')}>
      <AppSwitch aria-label={recency} disabled={saving}
        checked={settings.recencyWeighting ?? DEFAULT_REVIEW_TRAINING_OPTIONS.recencyWeighting}
        onCheckedChange={recencyWeighting => save({ recencyWeighting })} />
    </CompanionSettingRow>
    <CompanionSettingRow title={penalties} description={t('settings.review.training.penaltiesDescription')}>
      <AppSwitch aria-label={penalties} disabled={saving}
        checked={settings.reviewIntervalPenalties ?? DEFAULT_REVIEW_TRAINING_OPTIONS.reviewIntervalPenalties}
        onCheckedChange={reviewIntervalPenalties => save({ reviewIntervalPenalties })} />
    </CompanionSettingRow>
    {failed ? <p className="py-3 text-sm text-error" role="alert">{t('companion.settings.learning.saveError')}</p> : null}
  </>;
}
