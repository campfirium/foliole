import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionReadingSystemBars } from '../shared/platform/companionReadingSystemBars';
import { AppSwitch } from '../shared/ui/AppSwitch';

import { saveCompanionReadingDisplay, useCompanionReadingDisplay } from './companionReadingDisplay';
import { CompanionReadingSystemBarNotice } from './CompanionReadingSystemBarNotice';

export function CompanionReadingDisplayControls() {
  const t = useTranslation();
  const settings = useCompanionReadingDisplay();
  const [saveError, setSaveError] = useState(false);
  return <div className="companion-reading-display-controls border-b border-companion-divider py-3">
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{t('companion.reading.overlayToolbars')}</span>
      <AppSwitch aria-label={t('companion.reading.overlayToolbars')} checked={settings.overlayToolbars}
        onCheckedChange={overlayToolbars => setSaveError(!saveCompanionReadingDisplay({ overlayToolbars }))} />
    </div>
    {supportsCompanionReadingSystemBars() ? <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{t('companion.reading.hideSystemStatusBar')}</span>
      <AppSwitch aria-label={t('companion.reading.hideSystemStatusBar')} checked={settings.hideSystemStatusBar}
        onCheckedChange={hideSystemStatusBar => setSaveError(!saveCompanionReadingDisplay({ hideSystemStatusBar }))} />
    </div> : null}
    <CompanionReadingSystemBarNotice inline />
    {saveError ? <p className="py-2 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </div>;
}
