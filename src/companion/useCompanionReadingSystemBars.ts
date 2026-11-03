import { useEffect } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingSystemBars, supportsCompanionReadingSystemBars } from '../shared/platform/companionReadingSystemBars';

import { useCompanionReadingDisplay } from './companionReadingDisplay';

export function useCompanionReadingSystemBars(editing: boolean, chromeVisible: boolean) {
  useEffect(() => () => {
    if (supportsCompanionReadingSystemBars()) void companionReadingSystemBars.request({ enabled: false, hidden: false });
  }, []);
  const { hideSystemStatusBar } = useCompanionReadingDisplay();
  useEffect(() => {
    if (!supportsCompanionReadingSystemBars()) return;
    const enabled = hideSystemStatusBar && !editing;
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
  }, [hideSystemStatusBar, editing, chromeVisible]);
}
