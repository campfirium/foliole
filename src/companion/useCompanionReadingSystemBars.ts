import { useEffect } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingSystemBars, supportsCompanionReadingSystemBars } from '../shared/platform/companion/reading/companionReadingSystemBars';

import { useCompanionReadingDisplay } from './companionReadingDisplay';

// Moving to the next card unmounts the article before the next one mounts; releasing at once lets Android flash the status bar.
const RELEASE_GRACE_MS = 1500;
let pendingRelease: ReturnType<typeof setTimeout> | null = null;

export function useCompanionReadingSystemBars(normalLayout: boolean) {
  useEffect(() => {
    if (pendingRelease) { clearTimeout(pendingRelease); pendingRelease = null; }
    return () => {
      if (!supportsCompanionReadingSystemBars()) return;
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        void companionReadingSystemBars.request({ enabled: false, hidden: false });
      }, RELEASE_GRACE_MS);
    };
  }, []);
  const { hideSystemStatusBar } = useCompanionReadingDisplay();
  useEffect(() => {
    if (!supportsCompanionReadingSystemBars()) return;
    // Reading toolbars never reveal the status bar; the native window shows it transiently on a top-edge swipe.
    const enabled = hideSystemStatusBar && !normalLayout;
    const target = { enabled, hidden: enabled };
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
  }, [hideSystemStatusBar, normalLayout]);
}
