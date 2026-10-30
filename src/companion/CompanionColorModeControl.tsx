import type { BaseColorMode } from '../features/settings/model/baseColorMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';

import { useCompanionColorMode } from './CompanionColorModeProvider';

const OPTIONS: readonly BaseColorMode[] = ['system', 'light', 'dark'];

export function CompanionColorModeControl() {
  const colorMode = useCompanionColorMode();
  const t = useTranslation();
  if (!colorMode) return null;
  return <fieldset className="border-b border-companion-divider py-4">
    <legend className="text-sm font-medium text-foreground">{t('settings.appearance.colorMode.section')}</legend>
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((mode) => <button aria-pressed={colorMode.mode === mode}
        className={`min-h-11 rounded-md border px-2 text-sm text-foreground ${colorMode.mode === mode
          ? 'border-companion-accent bg-companion-accent-soft'
          : 'border-companion-divider active:bg-companion-subtle/80'}`}
        key={mode} onClick={() => colorMode.updateMode(mode)} type="button">
        {t(`settings.appearance.colorMode.${mode}`)}
      </button>)}
    </div>
    {colorMode.saveError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.colorMode.saveError')}</p> : null}
    {colorMode.hostError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.settings.colorMode.hostError')}</p> : null}
  </fieldset>;
}
