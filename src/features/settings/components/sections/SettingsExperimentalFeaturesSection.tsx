import { getExperimentalFeaturePreviews, isInternalFeaturePreviewBuild } from '../../../../shared/config/featurePreviews';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  isExperimentalFeatureEnabled,
  setExperimentalFeatureEnabled,
  useFeaturePreviewPreferences
} from '../../../../shared/platform/featurePreviewPreferences';
import { SettingsControlSlot, SettingsRow, SettingsSection } from '../../../../shared/ui';
import { AppSwitch } from '../../../../shared/ui/AppSwitch';

export function SettingsExperimentalFeaturesSection() {
  const t = useTranslation();
  const preferences = useFeaturePreviewPreferences();
  const features = getExperimentalFeaturePreviews();
  if (isInternalFeaturePreviewBuild() || !features.length) return null;

  const title = t('settings.experimentalFeatures.title');
  return (
    <SettingsSection ariaLabel={title} description={t('settings.experimentalFeatures.description')} title={title}>
      {features.map(({ id, labelKey }) => {
        const label = t(labelKey);
        return (
          <SettingsRow key={id} title={label}>
            <SettingsControlSlot>
              <AppSwitch
                aria-label={label}
                checked={isExperimentalFeatureEnabled(id, preferences)}
                onCheckedChange={enabled => setExperimentalFeatureEnabled(id, enabled)}
              />
            </SettingsControlSlot>
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
