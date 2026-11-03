import { useSyncExternalStore } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { companionReadingSystemBars } from '../shared/platform/companionReadingSystemBars';

export function CompanionReadingSystemBarNotice(props: { inline?: boolean }) {
  const failed = useSyncExternalStore(companionReadingSystemBars.subscribe, companionReadingSystemBars.getError);
  const t = useTranslation();
  if (!failed) return null;
  return <div role="alert" className={props.inline ? 'py-2 text-sm text-error' : 'companion-reading-system-bar-banner fixed inset-x-0 top-0 z-modal bg-companion-base p-4 text-sm text-error'}>
    <p>{t('companion.reading.systemStatusBarError')}</p>
    <button type="button" className="min-h-11 underline" onClick={() => { void companionReadingSystemBars.retry(); }}>
      {t('companion.reading.retrySystemStatusBar')}
    </button>
  </div>;
}
