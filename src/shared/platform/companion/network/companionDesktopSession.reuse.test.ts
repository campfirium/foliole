import { afterEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ discover: vi.fn(), request: vi.fn(), group: vi.fn() }));
vi.mock('../../companionWorkspaceDiscovery', () => ({ discoverCompanionDesktops: runtime.discover }));
vi.mock('./companionSyncSessionHttp.js', () => ({ requestCompanionSyncSession: runtime.request }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionNetworkRuntime: () => true, normalizeEndpointUrl: (value: string) => value
}));
vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: runtime.group }));

import { closeCompanionDesktopSession, companionDesktopSessionTarget, ensureCompanionDesktopSession,
  invalidateCompanionDesktopSession, subscribeCompanionDesktopChanges, waitForCompanionDesktopChanges } from './companionDesktopSession';
import { resolveReachableCompanionWorkspaceSyncEndpoints } from './companionWorkspaceEndpoint';

const target = { endpointUrl: 'http://mac:38641', deviceId: 'mac', groupId: 'group',
  protocolVersion: 28, platform: 'darwin' };

async function connect() {
  runtime.group.mockResolvedValue({ group_id: 'group', local_device_identity_key: 'phone', devices: [] });
  runtime.discover.mockResolvedValue([]);
  runtime.request.mockResolvedValue({ session: '00000000-0000-4000-8000-000000000001',
    marker: { instance: '00000000-0000-4000-8000-000000000002', sequence: 0 }, changed: false });
  await ensureCompanionDesktopSession(target.endpointUrl, target.deviceId, { target, libraryEpoch: 'epoch-a' });
}

afterEach(async () => { await closeCompanionDesktopSession(); vi.resetAllMocks(); });

it('reuses the authenticated desktop without discovery and preserves its negotiated protocol', async () => {
  await connect();
  await expect(resolveReachableCompanionWorkspaceSyncEndpoints(target.endpointUrl)).resolves.toEqual([target]);
  await expect(resolveReachableCompanionWorkspaceSyncEndpoints(target.endpointUrl)).resolves.toEqual([target]);
  expect(runtime.discover).not.toHaveBeenCalled();
  expect(runtime.request).toHaveBeenCalledTimes(1);
});

it('rediscovers after background closure or an invalid address', async () => {
  await connect();
  await invalidateCompanionDesktopSession(target.endpointUrl);
  await expect(resolveReachableCompanionWorkspaceSyncEndpoints(target.endpointUrl)).rejects.toThrow('discovery_no_devices');
  expect(runtime.discover).toHaveBeenCalledOnce();
});

it('does not reuse a session belonging to another group', async () => {
  await connect();
  runtime.group.mockResolvedValue({ group_id: 'other', local_device_identity_key: 'phone', devices: [] });
  await expect(resolveReachableCompanionWorkspaceSyncEndpoints(target.endpointUrl)).rejects.toThrow('discovery_no_devices');
  expect(runtime.discover).toHaveBeenCalledOnce();
});

it('reopens the desktop session when the authenticated library epoch changes', async () => {
  await connect();
  await ensureCompanionDesktopSession(target.endpointUrl, target.deviceId, { target, libraryEpoch: 'epoch-b' });
  expect(runtime.request.mock.calls.map(([, input]) => input.operation)).toEqual(['open', 'close', 'open']);
});

it('keeps independently triggered mobile discovery available with a healthy desktop session', async () => {
  await connect();
  runtime.discover.mockResolvedValue([{ compatibility: { status: 'compatible', negotiated_version: 26 },
    endpointUrl: 'http://phone:38641', discovery: { group_id: 'group', provider_device_id: 'remote-phone',
      provider_platform: 'ios-capacitor' } }]);
  const peers = await resolveReachableCompanionWorkspaceSyncEndpoints(target.endpointUrl, { mobilePeersOnly: true });
  expect(peers.map(peer => peer.deviceId)).toEqual(['remote-phone']);
  expect(runtime.discover).toHaveBeenCalledOnce();
});

it('moves toward a higher-priority desktop named by the upstream, once per named desktop', async () => {
  await connect();
  const marker = { instance: '00000000-0000-4000-8000-000000000002', sequence: 0 };
  runtime.request.mockImplementation(async (_endpoint: string, input: { operation: string }) => {
    if (input.operation === 'wait') return runtime.request.mock.calls.filter(([, call]) => call.operation === 'wait').length === 1
      ? { session: '00000000-0000-4000-8000-000000000001', marker, changed: false, tier: 1, best: { device_id: 'windows', tier: 2 } }
      : new Promise(() => undefined);
    if (input.operation === 'close') return { closed: true };
    return { session: '00000000-0000-4000-8000-000000000003', marker, changed: false };
  });
  const woke = vi.fn(async () => undefined);
  const unsubscribe = subscribeCompanionDesktopChanges(woke);
  waitForCompanionDesktopChanges();
  await vi.waitFor(() => expect(woke).toHaveBeenCalledOnce());
  expect(companionDesktopSessionTarget('group')).toBeNull();

  await ensureCompanionDesktopSession(target.endpointUrl, target.deviceId, { target, libraryEpoch: 'epoch-a' });
  let hinted = 0;
  runtime.request.mockImplementation(async (_endpoint: string, input: { operation: string }) => {
    if (input.operation !== 'wait') return { closed: true };
    hinted += 1;
    return hinted === 1
      ? { session: '00000000-0000-4000-8000-000000000003', marker, changed: false, best: { device_id: 'windows', tier: 2 } }
      : new Promise(() => undefined);
  });
  waitForCompanionDesktopChanges();
  await vi.waitFor(() => expect(hinted).toBe(2));
  expect(woke).toHaveBeenCalledOnce();
  expect(companionDesktopSessionTarget('group')).toEqual(target);
  unsubscribe();
});
