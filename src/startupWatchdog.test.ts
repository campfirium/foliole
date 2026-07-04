import { beforeEach, expect, it, vi } from 'vitest';

const reportRuntimeAppReady = vi.fn();
const reportRuntimeBootStage = vi.fn();

vi.mock('./shared/platform/bridge', () => ({
  reportRuntimeAppReady,
  reportRuntimeBootStage
}));

beforeEach(() => {
  vi.useFakeTimers();
  reportRuntimeAppReady.mockClear();
  reportRuntimeBootStage.mockClear();
  document.body.innerHTML = '<div id="root"></div>';
  document.body.dataset.bootSkeleton = '';
  delete window.__FOLIOLE_APP_READY_REPORTED__;
  delete window.__FOLIOLE_BRIDGE_READY_REPORTED__;
});

it('reports app ready when the root is present and the bridge is ready', async () => {
  const { registerStartupWatchdog } = await import('./startupWatchdog');
  window.__FOLIOLE_BRIDGE_READY_REPORTED__ = true;

  registerStartupWatchdog('root');
  vi.runOnlyPendingTimers();

  expect(document.body.dataset.bootSkeleton).toBe('hidden');
  expect(reportRuntimeBootStage).toHaveBeenCalledWith('app_ready_watchdog_fallback', expect.objectContaining({
    rootPresent: true
  }));
  expect(reportRuntimeAppReady).toHaveBeenCalledWith(expect.objectContaining({
    source: 'startup_watchdog_bridge_ready'
  }));
});

it('keeps timeout telemetry when the bridge is not ready', async () => {
  const { registerStartupWatchdog } = await import('./startupWatchdog');

  registerStartupWatchdog('root');
  vi.runOnlyPendingTimers();

  expect(reportRuntimeBootStage).toHaveBeenCalledWith('app_ready_timeout', expect.objectContaining({
    rootPresent: true
  }));
  expect(reportRuntimeAppReady).not.toHaveBeenCalled();
});
