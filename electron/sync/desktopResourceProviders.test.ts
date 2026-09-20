import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  group: vi.fn(), blocked: vi.fn(() => false), endpoints: vi.fn(), compatible: vi.fn(), exchange: vi.fn(),
  create: vi.fn(({ body }: { body: string }) => ({ body, headers: {} })),
  read: vi.fn(async ({ response }: { response: Response }) => Buffer.from(await response.arrayBuffer()))
}));
vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner: (fn: () => unknown) => fn() }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: mocks.group }));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({ isDesktopSyncGroupDeviceBlocked: mocks.blocked }));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({ loadDesktopSyncGroupMemberEndpoints: mocks.endpoints }));
vi.mock('./desktopSyncGroupMemberState.js', () => ({ exchangeDesktopSyncGroupMemberState: mocks.exchange }));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({ assertDesktopSyncGroupPeerCompatible: mocks.compatible }));
vi.mock('./desktopSyncGroupHttp.js', () => ({ createDesktopWorkgroupPost: mocks.create, readDesktopWorkgroupResponse: mocks.read }));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({ group_key: 'fixture-key' }) }));

import { loadDesktopResourceProviders, queryDesktopResourceAvailability } from './desktopResourceProviders.js';

const target = { group_id: 'group', local_device_id: 'local', endpoint_url: 'http://anchor',
  peer_device_id: 'anchor', peer_device_name: 'Anchor', peer_platform: 'darwin' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.mockReturnValue(false);
  mocks.exchange.mockResolvedValue({ localExited: false, peerBlocked: false });
  mocks.group.mockReturnValue({ group_id: 'group', local_device_identity_key: 'local', devices:
    ['local', 'anchor', 'mobile', 'offline', 'removed'].map((device_identity_key) => ({ device_identity_key, state: 'active' })) });
  mocks.endpoints.mockReturnValue(['mobile', 'removed', 'unregistered'].map((peer_device_id) => ({ ...target,
    peer_device_id, peer_platform: 'ios-capacitor', endpoint_url: `http://${peer_device_id}` })));
});

it('uses all discovered active members, retains unknown offline members, and excludes blocked devices', () => {
  mocks.blocked.mockImplementation((_group?: string, id?: string) => id === 'removed');
  const result = loadDesktopResourceProviders(target);
  expect(result.providers.map((peer) => peer.deviceId)).toEqual(['anchor', 'mobile']);
  expect(result.eligibleDeviceIds).toEqual(['anchor', 'mobile', 'offline']);
});

it('requires protocol and membership before the encrypted batched request', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ provider_device_id: 'anchor', resources: [] })));
  vi.stubGlobal('fetch', fetchMock);
  const peer = loadDesktopResourceProviders(target).providers[0]!;
  await queryDesktopResourceAvailability(peer, []);
  expect(mocks.compatible).toHaveBeenCalledWith(peer);
  expect(mocks.exchange).toHaveBeenCalledWith(peer);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ pathWithQuery: '/companion/resource-availability' }));
  expect(mocks.exchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]!);
  mocks.exchange.mockResolvedValue({ localExited: false, peerBlocked: true });
  await expect(queryDesktopResourceAvailability(peer, [])).rejects.toThrow('sync_group_device_not_active');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
