import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  addListener: vi.fn(),
  postResult: vi.fn(),
  remove: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    addListener: runtime.addListener,
    startDiscoverySession: runtime.start,
    stopDiscoverySession: runtime.stop
  }
}));
vi.mock('./iosBridgeAcceptance', () => ({ postResult: runtime.postResult }));

import { runIosSyncGroupDiscoveryAcceptance } from './iosSyncGroupDiscoveryAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.addListener.mockResolvedValue({ remove: runtime.remove });
  runtime.start.mockResolvedValue({ candidates: [], change: 'started', error_code: null, status: 'searching' });
  runtime.stop.mockResolvedValue({ candidates: [], change: 'stopped', error_code: null, status: 'stopped' });
});

it('accepts only native discovery start and stop events delivered through the Capacitor bridge', async () => {
  await runIosSyncGroupDiscoveryAcceptance();

  expect(runtime.addListener).toHaveBeenCalledWith('syncGroupDiscoveryChanged', expect.any(Function));
  expect(runtime.postResult).toHaveBeenCalledWith(expect.objectContaining({
    phase: 'events-observed', scenario: 'sync-group-discovery-events', status: 'passed'
  }));
  expect(runtime.remove).toHaveBeenCalledOnce();
});

it('reports a failed acceptance result when the native stop event is absent', async () => {
  runtime.stop.mockResolvedValue({ candidates: [], change: 'failed', error_code: 'unavailable', status: 'unavailable' });

  await runIosSyncGroupDiscoveryAcceptance();

  expect(runtime.postResult).toHaveBeenCalledWith(expect.objectContaining({
    phase: 'failed', scenario: 'sync-group-discovery-events', status: 'failed'
  }));
});
