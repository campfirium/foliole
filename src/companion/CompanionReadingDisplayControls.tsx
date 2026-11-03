import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppSwitch } from '../shared/ui/AppSwitch';

import { saveCompanionReadingDisplay, useCompanionReadingDisplay } from './companionReadingDisplay';

export function CompanionReadingDisplayControls() {
  const t = useTranslation();
  const settings = useCompanionReadingDisplay();
  const [saveError, setSaveError] = useState(false);
  return <div className="border-b border-companion-divider py-3">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{t('companion.reading.overlayToolbars')}</span>
      <AppSwitch aria-label={t('companion.reading.overlayToolbars')} checked={settings.overlayToolbars}
        onCheckedChange={overlayToolbars => setSaveError(!saveCompanionReadingDisplay({ overlayToolbars }))} />
    </div>
    {saveError ? <p className="py-2 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </div>;
}
