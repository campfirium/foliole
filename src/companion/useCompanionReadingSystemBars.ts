import { useEffect, useRef, type MutableRefObject } from 'react';

import { subscribeNativeAppForeground } from '../shared/platform/appLifecycle';
import { companionReadingSystemBars, supportsCompanionReadingSystemBars } from '../shared/platform/companion/reading/companionReadingSystemBars';

import { useCompanionReadingDisplay } from './companionReadingDisplay';

function release(held: MutableRefObject<boolean>) {
  if (!held.current) return;
  held.current = false;
  void companionReadingSystemBars.request({ enabled: false, hidden: false });
}

/** Called only by the reading session: holds the bars while reading and hands them back as soon as it ends. */
export function useCompanionReadingSystemBars(reading: boolean, normalLayout: boolean) {
  const held = useRef(false);
  useEffect(() => () => release(held), []);
  const { hideSystemStatusBar } = useCompanionReadingDisplay();
  useEffect(() => {
    if (!supportsCompanionReadingSystemBars()) return;
    if (!reading) { release(held); return; }
    held.current = true;
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
  }, [hideSystemStatusBar, normalLayout, reading]);
}
