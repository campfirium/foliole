import { beforeEach, expect, it, vi } from 'vitest';

import type { SyncGroupDiscoverySnapshot } from '../../../../lib/platform/syncGroupDiscoveryContract';
import type { CompanionNativeDiscoveryEvent } from '../companionWorkspaceSyncPluginTypes';

import { startCompanionSyncGroupDiscoverySession } from './syncGroupDiscoverySession';

const runtime = vi.hoisted(() => ({
  addListener: vi.fn(),
  load: vi.fn(),
  native: true,
  remove: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}));

vi.mock('../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    addListener: runtime.addListener,
    startDiscoverySession: runtime.start,
    stopDiscoverySession: runtime.stop
  },
  isNativeCompanionPairingRuntime: () => runtime.native
}));
vi.mock('../companionWorkspaceDiscovery', () => ({ loadCompanionDiscoveryCandidates: runtime.load }));

beforeEach(() => {
  vi.clearAllMocks();
  runtime.native = true;
  runtime.addListener.mockResolvedValue({ remove: runtime.remove });
  runtime.start.mockResolvedValue({ candidates: [], change: 'started', error_code: null, status: 'searching' });
  runtime.stop.mockResolvedValue({ candidates: [], change: 'stopped', error_code: null, status: 'stopped' });
});

it('keeps native discovery active until explicit cleanup and publishes native changes', async () => {
  const subscription: { listener?: (event: CompanionNativeDiscoveryEvent) => void } = {};
  runtime.addListener.mockImplementation(async (_name, next) => {
    subscription.listener = next;
    return { remove: runtime.remove };
  });
  const snapshots: SyncGroupDiscoverySnapshot[] = [];
  const stop = await startCompanionSyncGroupDiscoverySession((snapshot) => snapshots.push(snapshot));

  subscription.listener?.({ candidates: [], change: 'lost', error_code: null, status: 'searching' });
  await stop();

  expect(runtime.start).toHaveBeenCalledOnce();
  expect(snapshots.map(({ change }) => change)).toEqual(['started', 'lost']);
  expect(runtime.stop).toHaveBeenCalledOnce();
  expect(runtime.remove).toHaveBeenCalledOnce();
});

it('reports an old bridge as incompatible without a timed fallback', async () => {
  runtime.addListener.mockRejectedValue(new Error('method unavailable'));
  const snapshots: SyncGroupDiscoverySnapshot[] = [];

  await startCompanionSyncGroupDiscoverySession((snapshot) => snapshots.push(snapshot));

  expect(snapshots).toEqual([expect.objectContaining({ status: 'incompatible' })]);
  expect(runtime.load).not.toHaveBeenCalled();
});
