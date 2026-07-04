import { reportRuntimeAppReady, reportRuntimeBootStage } from './shared/platform/bridge';

const STARTUP_WATCHDOG_DELAY_MS = 5000;

export function registerStartupWatchdog(rootId: string) {
  window.setTimeout(() => {
    if (window.__FOLIOLE_APP_READY_REPORTED__) {
      return;
    }
    const payload = {
      href: window.location.href,
      readyState: document.readyState,
      rootPresent: Boolean(document.getElementById(rootId))
    };
    if (payload.rootPresent && window.__FOLIOLE_BRIDGE_READY_REPORTED__) {
      document.body.dataset.bootSkeleton = 'hidden';
      reportRuntimeBootStage('app_ready_watchdog_fallback', payload);
      reportRuntimeAppReady({
        ...payload,
        source: 'startup_watchdog_bridge_ready'
      });
      return;
    }
    reportRuntimeBootStage('app_ready_timeout', payload);
  }, STARTUP_WATCHDOG_DELAY_MS);
}
