import { afterEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR, serializeSyncProtocolTxt } from '../../../lib/platform/syncProtocolContract';


const native = vi.hoisted(() => ({ request: vi.fn(), cancel: vi.fn(async () => {}),
  load: vi.fn(), background: () => {}, add: vi.fn(), start: vi.fn(), stop: vi.fn(async () => ({})), remove: vi.fn(async () => {}) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: () => ({ loadDiscoveryCandidates: native.load, desktopHttpRequest: native.request, cancelRequestSyncHttp: native.cancel,
    addListener: native.add, startDiscoverySession: native.start, stopDiscoverySession: native.stop }) }));
vi.mock('./companion/runtime/companionFramedPayloadBudget', () => ({
  companionFramedFileOwner: () => ({ library_key: 'library', generation_id: 'generation' })
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => ({}) }));

vi.mock('./appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppEnteredBackground: async (listener: () => void) => { native.background = listener; return () => {}; } }));

import { acquireCompanionDiscovery } from './companion/network/companionDiscoveryLease';
import { discoverCompanionDesktops } from './companionWorkspaceDiscovery';
import type { CompanionNativeDiscoveryEvent } from './companionWorkspaceSyncPluginTypes';

const options = { fastDesktop: true, requiredGroupId: 'group', allowWhileNotParticipating: true };
const protocol = CURRENT_SYNC_PROTOCOL_DESCRIPTOR;
function event(platform = 'darwin', group = 'group'): CompanionNativeDiscoveryEvent {
  return { status: 'results', change: 'found', error_code: null, candidates: [{ source: 'nsd',
    endpoint_url: `http://${platform}`, protocol_txt: { ...serializeSyncProtocolTxt(protocol),
      group_id: group, group_tag: 'tag', device_id: platform, provider_platform: platform } }] };
}
function reply(platform = 'darwin', group = 'group') {
  return { status: 200, body: JSON.stringify({ protocol, group_id: group, group_tag: 'tag',
    provider_device_id: platform, provider_platform: platform }) };
}
function setup() {
  vi.useFakeTimers(); vi.clearAllMocks();
  native.add.mockResolvedValue({ remove: native.remove });
  native.start.mockResolvedValue(event());
  native.load.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(event()), 5000)));
  native.request.mockImplementation(async ({ url }) => url.startsWith('http://darwin') ? reply() : new Promise(() => {}));
}
afterEach(() => vi.useRealTimers());

it('returns a reachable same-group desktop immediately and cancels the stalled native probe', async () => {
  setup();
  let completed = false;
  const pending = discoverCompanionDesktops('http://stale', options).then(value => { completed = true; return value; });
  await vi.advanceTimersByTimeAsync(100);
  const returnedBeforeTimeout = completed;
  if (!completed) await vi.advanceTimersByTimeAsync(5000);
  expect(returnedBeforeTimeout).toBe(true);
  expect(await pending).toEqual([expect.objectContaining({ endpointUrl: 'http://darwin' })]);
  const stalled = native.request.mock.calls.find(([arg]) => arg.url.startsWith('http://stale'))![0];
  expect(native.cancel).toHaveBeenCalledWith({ library_key: 'library', generation_id: 'generation', request_id: stalled.request_id });
  expect(native.stop).toHaveBeenCalledOnce();
});

it('does not stop a pairing subscriber when automatic discovery finishes', async () => {
  setup();
  const release = await acquireCompanionDiscovery(() => {});
  await discoverCompanionDesktops('', options);
  expect(native.start).toHaveBeenCalledOnce();
  expect(native.stop).not.toHaveBeenCalled();
  await release();
  expect(native.stop).toHaveBeenCalledOnce();
});

it('keeps mobile-only results while waiting for a desktop and rejects a wrong-group preferred route', async () => {
  setup(); native.start.mockResolvedValue(event('ios-capacitor'));
  native.request.mockImplementation(async ({ url }) => url.startsWith('http://old')
    ? reply('darwin', 'wrong-group') : reply('ios-capacitor'));
  let completed = false;
  const pending = discoverCompanionDesktops('http://old', options).then(value => { completed = true; return value; });
  await vi.advanceTimersByTimeAsync(100);
  expect(completed).toBe(false);
  await vi.advanceTimersByTimeAsync(4900);
  expect(await pending).toEqual([expect.objectContaining({ endpointUrl: 'http://ios-capacitor' })]);
});

it('cancels native discovery and HTTP when its caller aborts', async () => {
  setup(); native.request.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = discoverCompanionDesktops('http://stale', { ...options, signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow('background');
  await vi.advanceTimersByTimeAsync(100);
  controller.abort(new Error('background'));
  await rejected;
  expect(native.cancel).toHaveBeenCalledTimes(2);
  expect(native.stop).toHaveBeenCalledOnce();
});

it('ends discovery on a native background event without waiting for the timeout', async () => {
  setup(); native.request.mockImplementation(() => new Promise(() => {}));
  const pending = discoverCompanionDesktops('http://stale', options);
  const rejected = expect(pending).rejects.toThrow('request_sync_foreground_ended');
  await vi.advanceTimersByTimeAsync(100);
  native.background();
  await rejected;
  expect(native.stop).toHaveBeenCalledOnce();
  expect(native.cancel).toHaveBeenCalledTimes(2);
});
