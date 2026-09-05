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
  isNativeCompanionNetworkRuntime: () => runtime.native
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

it('keeps searching when a mobile-only advertisement arrives before a desktop', async () => {
  const subscription: { listener?: (event: CompanionNativeDiscoveryEvent) => void } = {};
  runtime.addListener.mockImplementation(async (_name, next) => {
    subscription.listener = next;
    return { remove: runtime.remove };
  });
  const snapshots: SyncGroupDiscoverySnapshot[] = [];
  await startCompanionSyncGroupDiscoverySession((snapshot) => snapshots.push(snapshot));

  subscription.listener?.({ candidates: [{
    endpoint_url: 'http://iphone:38641', source: 'nsd',
    protocol_txt: { provider_platform: 'ios-capacitor' }
  }], change: 'found', error_code: null, status: 'results' });

  expect(snapshots.at(-1)).toEqual(expect.objectContaining({ candidates: [], status: 'searching' }));
  expect(runtime.load).not.toHaveBeenCalled();
});

it('publishes one join result when several members advertise the same Sync Group', async () => {
  runtime.start.mockResolvedValue({ candidates: [
    { endpoint_url: 'http://android:38643', source: 'bonjour' },
    { endpoint_url: 'http://windows:38641', source: 'bonjour' }
  ], change: 'found', error_code: null, status: 'results' });
  runtime.load.mockResolvedValue([
    { compatibility: { status: 'compatible' }, endpointUrl: 'http://android:38643', discovery: {
      group_display_name: 'Studio', group_id: 'group-1', group_tag: 'tag-1',
      provider_device_id: 'android', provider_device_name: 'A5', provider_platform: 'android-capacitor'
    } },
    { compatibility: { status: 'compatible' }, endpointUrl: 'http://windows:38641', discovery: {
      group_display_name: 'Studio', group_id: 'group-1', group_tag: 'tag-1',
      provider_device_id: 'windows', provider_device_name: 'V', provider_platform: 'windows'
    } }
  ]);
  const snapshots: SyncGroupDiscoverySnapshot[] = [];

  await startCompanionSyncGroupDiscoverySession((snapshot) => snapshots.push(snapshot));

  expect(snapshots.at(-1)?.candidates).toEqual([
    expect.objectContaining({ endpoint_url: 'http://windows:38641', group_id: 'group-1' })
  ]);
});
