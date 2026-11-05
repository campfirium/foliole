import type { BaseColorMode } from '../features/settings/model/baseColorMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { settingsSwitchClassName, settingsSwitchKnobClassName } from '../shared/ui';
import { settingsTouchChoiceButtonClassName, settingsTouchChoiceGroupClassName } from '../shared/ui/settingsTouchChoiceStyles';

import { useCompanionColorMode } from './CompanionColorModeProvider';
import { CompanionPdfReadingModeControl } from './CompanionPdfReadingModeControl';

const OPTIONS: readonly BaseColorMode[] = ['system', 'light', 'dark'];

export function CompanionColorModeControl() {
  const colorMode = useCompanionColorMode();
  const t = useTranslation();
  if (!colorMode) return null;
  return <fieldset className="border-b border-companion-divider py-4">
    <legend className="text-sm font-medium text-foreground">{t('settings.appearance.colorMode.section')}</legend>
    <div className={settingsTouchChoiceGroupClassName}>
      {OPTIONS.map((mode) => <button aria-pressed={colorMode.mode === mode}
        className={settingsTouchChoiceButtonClassName(colorMode.mode === mode)}
        key={mode} onClick={() => colorMode.updateMode(mode)} type="button">
        {t(`settings.appearance.colorMode.${mode}`)}
      </button>)}
    </div>
    <div className="mt-4 flex min-h-12 items-center justify-between gap-4 text-sm text-foreground">
      <span>{t('settings.appearance.dimImages.title')}</span>
      <button aria-checked={colorMode.dimImages} aria-label={t('settings.appearance.dimImages.title')}
        className={settingsSwitchClassName(colorMode.dimImages, "before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']")}
        onClick={() => colorMode.updateDimImages(!colorMode.dimImages)} role="switch" type="button">
        <span aria-hidden="true" className={settingsSwitchKnobClassName(colorMode.dimImages)} />
      </button>
    </div>
    <CompanionPdfReadingModeControl />
    {colorMode.dimImagesSaveError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
    {colorMode.saveError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.colorMode.saveError')}</p> : null}
    {colorMode.hostError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.colorMode.hostError')}</p> : null}
  </fieldset>;
}
