import {
  APP_LANGUAGE_OPTIONS,
  isAppLanguagePreference
} from '../../../../shared/localization/appLanguage';
import { useLocalization, useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SETTINGS_SELECT_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsFieldClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps } from '../../model/settingsSearch';
import { useLocalizedSettingsSearchRow } from '../useLocalizedSettingsSearchRows';

export function SettingsLanguageSection() {
  const t = useTranslation();
  const { languagePreference, setLanguagePreference } = useLocalization();
  const languageRow = useLocalizedSettingsSearchRow('general-language');

  return (
    <SettingsSection ariaLabel={t('settings.general.language.section')} title={t('settings.general.language.section')}>
      <SettingsRow
        description={languageRow.description}
        {...settingsSearchRowProps(languageRow)}
        title={languageRow.title}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <select
            aria-label={t('settings.general.language.aria')}
            className={settingsFieldClassName(SETTINGS_SELECT_WIDTH_CLASS_NAME)}
            onChange={(event) => {
              if (isAppLanguagePreference(event.target.value)) {
                setLanguagePreference(event.target.value);
              }
            }}
            value={languagePreference}
          >
            <option value="system">System</option>
            {APP_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}
