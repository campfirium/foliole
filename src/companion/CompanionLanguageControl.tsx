import { useState } from 'react';

import { APP_LANGUAGE_OPTIONS, isAppLanguagePreference } from '../shared/localization/appLanguage';
import { useLocalization } from '../shared/localization/LocalizationProvider';

export function CompanionLanguageControl() {
  const { languagePreference, setLanguagePreference, t } = useLocalization();
  const [saveError, setSaveError] = useState(false);
  return <div className="border-b border-companion-divider py-4">
    <label className="block text-sm font-medium text-foreground" htmlFor="companion-app-language">
      {t('settings.general.language.aria')}
    </label>
    <select
      className="mt-2 min-h-11 w-full rounded-md border border-companion-divider bg-background px-3 text-base text-foreground"
      id="companion-app-language"
      onChange={(event) => {
        if (!isAppLanguagePreference(event.target.value)) return;
        try {
          setLanguagePreference(event.target.value);
          setSaveError(false);
        } catch { setSaveError(true); }
      }}
      value={languagePreference}
    >
      <option value="system">{t('settings.appearance.colorMode.system')}</option>
      {APP_LANGUAGE_OPTIONS.map(({ label, value }) => <option key={value} value={value}>{label}</option>)}
    </select>
    {saveError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.language.saveError')}</p> : null}
  </div>;
}
