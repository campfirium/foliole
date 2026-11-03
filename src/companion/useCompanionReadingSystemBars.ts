import { useEffect } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingSystemBars, supportsCompanionReadingSystemBars } from '../shared/platform/companionReadingSystemBars';

import { useCompanionReadingDisplay } from './companionReadingDisplay';

export function useCompanionReadingSystemBars(editing: boolean) {
  const { hideSystemStatusBar } = useCompanionReadingDisplay();
  useEffect(() => {
    if (!supportsCompanionReadingSystemBars()) return;
    const hidden = hideSystemStatusBar && !editing;
    void companionReadingSystemBars.request(hidden);
    const reapply = () => { void companionReadingSystemBars.request(hidden, true); };
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void subscribeNativeAppForeground(() => { if (active) reapply(); }).then(remove => {
      if (active) unsubscribe = remove;
      else remove();
    }).catch(() => { if (active) companionReadingSystemBars.reportFailure(); });
    window.addEventListener('orientationchange', reapply);
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('orientationchange', reapply);
      void companionReadingSystemBars.request(false);
    };
  }, [hideSystemStatusBar, editing]);
}
