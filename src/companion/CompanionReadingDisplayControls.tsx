import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionReadingSystemBars } from '../shared/platform/companion/reading/companionReadingSystemBars';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { AppSwitch } from '../shared/ui/AppSwitch';

import { saveCompanionReadingDisplay, useCompanionReadingDisplay } from './companionReadingDisplay';
import { CompanionReadingSystemBarNotice } from './CompanionReadingSystemBarNotice';

export function CompanionReadingDisplayControls() {
  const t = useTranslation();
  const settings = useCompanionReadingDisplay();
  const systemBarsSupported = supportsCompanionReadingSystemBars();
  const browserPreview = getCompanionRuntimeCapability().kind === 'browser-preview';
  const [saveError, setSaveError] = useState(false);
  return <fieldset className="companion-reading-display-controls border-t border-companion-divider py-3">
    <legend className="px-0 text-xs font-semibold text-companion-text-tertiary">{t('companion.reading.screenDisplay')}</legend>
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{t('companion.reading.overlayToolbars')}</span>
      <AppSwitch aria-label={t('companion.reading.overlayToolbars')} checked={settings.overlayToolbars}
        onCheckedChange={overlayToolbars => setSaveError(!saveCompanionReadingDisplay({ overlayToolbars }))} />
    </div>
    {systemBarsSupported || browserPreview ? <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-medium text-foreground">{t('companion.reading.hideSystemStatusBar')}</span>
      <AppSwitch disabled={!systemBarsSupported} className="disabled:cursor-default disabled:opacity-40"
        aria-label={t('companion.reading.hideSystemStatusBar')} checked={settings.hideSystemStatusBar}
        onCheckedChange={hideSystemStatusBar => setSaveError(!saveCompanionReadingDisplay({ hideSystemStatusBar }))} />
    </div> : null}
    <CompanionReadingSystemBarNotice inline />
    {saveError ? <p className="py-2 text-sm text-error" role="alert">{t('companion.reading.font.saveError')}</p> : null}
  </fieldset>;
}
