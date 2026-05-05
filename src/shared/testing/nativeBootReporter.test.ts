import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reportNativeAppReady, reportNativeBootStage } from './nativeBootReporter';

const { getRuntimeInvoke } = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../platform/bridge', () => ({
  getRuntimeInvoke
}));

describe('nativeBootReporter', () => {
  beforeEach(() => {
    getRuntimeInvoke.mockReset();
    window.__FOLIOLE_APP_READY_REPORTED__ = undefined;
  });

  it('reports boot stages through the typed boot_report contract', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    getRuntimeInvoke.mockReturnValue(invoke);

    reportNativeBootStage('boot_start', { mode: 'desktop' });
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith('boot_report', {
      stage: 'boot_start',
      payload: { mode: 'desktop' }
    });
  });

  it('only reports app_ready once per window lifecycle', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    getRuntimeInvoke.mockReturnValue(invoke);

    reportNativeAppReady({ first: true });
    reportNativeAppReady({ first: false });
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('boot_report', {
      stage: 'app_ready',
      payload: { first: true }
    });
  });
});
