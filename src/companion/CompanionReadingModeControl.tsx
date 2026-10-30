import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { saveCompanionReadingMode, useCompanionReadingMode, type CompanionReadingMode } from './companionReadingMode';

const MODES: readonly CompanionReadingMode[] = ['continuous', 'paged'];

export function CompanionReadingModeControl() {
  const t = useTranslation();
  const mode = useCompanionReadingMode();
  const [saveError, setSaveError] = useState(false);
  return <fieldset className="py-4">
    <legend className="text-sm font-medium text-foreground">{t('companion.reading.mode')}</legend>
    <div className="grid grid-cols-2 gap-2">
      {MODES.map(option => <button
        aria-pressed={mode === option}
        className={`min-h-11 rounded-md border px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent ${mode === option
          ? 'border-companion-accent bg-companion-accent-soft text-companion-accent'
          : 'border-companion-divider text-foreground active:bg-companion-subtle/80'}`}
        key={option}
        onClick={() => setSaveError(!saveCompanionReadingMode(option))}
        type="button"
      >{t(`companion.reading.mode.${option}`)}</button>)}
    </div>
    {mode === 'paged' ? <p className="mt-3 text-sm text-companion-text-secondary">{t('companion.reading.mode.pagedHint')}</p> : null}
    {saveError ? <p className="mt-3 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </fieldset>;
}
