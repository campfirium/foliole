import { useEffect } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingSystemBars, supportsCompanionReadingSystemBars } from '../shared/platform/companion/reading/companionReadingSystemBars';

import { useCompanionReadingDisplay } from './companionReadingDisplay';

export function useCompanionReadingSystemBars(normalLayout: boolean, chromeVisible: boolean) {
  useEffect(() => () => {
    if (supportsCompanionReadingSystemBars()) void companionReadingSystemBars.request({ enabled: false, hidden: false });
  }, []);
  const { hideSystemStatusBar } = useCompanionReadingDisplay();
  useEffect(() => {
    if (!supportsCompanionReadingSystemBars()) return;
    const enabled = hideSystemStatusBar && !normalLayout;
    const target = { enabled, hidden: enabled && !chromeVisible };
    void companionReadingSystemBars.request(target);
    const reapply = () => { void companionReadingSystemBars.request(target, true); };
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
    };
  }, [hideSystemStatusBar, normalLayout, chromeVisible]);
}
