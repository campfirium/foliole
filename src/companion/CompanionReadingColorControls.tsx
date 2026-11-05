import { useTranslation } from '../shared/localization/LocalizationProvider';
import { SettingsSection } from '../shared/ui';
import { SettingsColorRow } from '../shared/ui/SettingsColorRow';

import { useCompanionColorMode } from './CompanionColorModeProvider';
import { READING_COLOR_CONTROLS, type ReadingColor } from './useCompanionReadingColors';

export function CompanionReadingColorControls() {
  const t = useTranslation();
  const settings = useCompanionColorMode();
  if (!settings) return null;
  return <SettingsSection title={t('settings.appearance.colors.section')} ariaLabel={t('settings.appearance.colors.sectionAria')}>
    {(Object.keys(READING_COLOR_CONTROLS) as ReadingColor[]).map(key => {
      const label = READING_COLOR_CONTROLS[key].label;
      return <SettingsColorRow compact key={key}
        title={t(`settings.appearance.${label}.title`)} description={t(`settings.appearance.${label}.description`)}
        colorInputAriaLabel={t(`settings.appearance.${label}.picker`)}
        resetButtonAriaLabel={t(`settings.appearance.${label}.reset`)}
        value={settings.colors[key]} defaultValue={settings.colorDefaults[key]}
        onChange={value => settings.updateReadingColor(key, value)}
        onReset={() => settings.updateReadingColor(key, settings.colorDefaults[key])} />;
    })}
    {settings.colorSaveError ? <p className="py-3 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </SettingsSection>;
}
