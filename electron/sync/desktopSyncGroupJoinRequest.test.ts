import { afterEach, expect, it, vi } from 'vitest';

const DEVICE = {
  canonical_library_path: '/library/Data/foliole.db',
  device_anchor: 'a1111111-1111-4111-8111-111111111111',
  group_id: 'group-1',
  identity_key: '[1,"group-1","a1111111-1111-4111-8111-111111111111","/library/Data/foliole.db"]',
  path_flavor: 'posix' as const
};
const CANDIDATE = {
  endpoint_url: 'http://provider', group_display_name: 'Studio', group_id: 'group-1',
  group_tag: 'tag-1', provider_device_id: 'device-provider',
  provider_device_name: 'Mac', provider_platform: 'macOS'
};
const JOINED_GROUP = {
  created_at: '2026-08-27T00:00:00.000Z', devices: [], display_name: 'Studio',
  group_id: 'group-1', local_device_identity_key: DEVICE.identity_key
};

const mocks = vi.hoisted(() => ({
  coordinator: vi.fn(async () => {
    if (mocks.ownerDepth !== 0) throw new Error('network sync retained the database owner');
    return { reason: 'initial', status: 'completed' };
  }),
  decrypt: vi.fn(async () => JSON.stringify({
    display_name: 'Studio', group_id: 'group-1',
    workgroup_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  })),
  existingGroup: null as typeof JOINED_GROUP | null,
  join: vi.fn(() => JOINED_GROUP),
  ownerDepth: 0,
  requestJson: vi.fn(async (url: string, init?: { body: string }) => {
    void init;
    return url.endsWith('/join-requests')
      ? { expires_at: '2026-08-27T00:02:00.000Z', request_id: 'request-1' }
      : { encrypted_group_info: {}, expires_at: '2026-08-27T00:02:00.000Z', request_id: 'request-1' };
  }),
  route: vi.fn((value) => value),
  savePending: vi.fn(),
  state: { candidates: [] as typeof CANDIDATE[], pending: null as null | Record<string, unknown> }
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ dbPath: '/library/Data/foliole.db' }),
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => {
    mocks.ownerDepth += 1;
    try { return await execute(); }
    finally { mocks.ownerDepth -= 1; }
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({
  joinDesktopSyncGroup: mocks.join, loadDesktopSyncGroup: () => mocks.existingGroup
}));
vi.mock('../deviceAnchorStore.js', () => ({
  loadDesktopDeviceIdentity: async () => ({ identity: DEVICE })
}));
vi.mock('./companionLanPayloads.js', () => ({ resolveDesktopHostName: () => 'Desktop B' }));
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: mocks.coordinator }));
vi.mock('./desktopSyncGroupHttp.js', () => ({ requestJson: mocks.requestJson }));
vi.mock('./desktopSyncGroupJoinCrypto.js', () => ({
  createDesktopSyncGroupJoinKey: async () => ({ privateKey: 'private', publicKey: 'public' }),
  decryptDesktopSyncGroupJoinInfo: mocks.decrypt
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: () => mocks.state,
  saveDesktopSyncGroupPendingJoin: mocks.savePending
}));
vi.mock('./desktopSyncGroupRoutes.js', () => ({ saveDesktopSyncGroupRoute: mocks.route }));

import {
  completeDesktopSyncGroupJoin,
  requestDesktopSyncGroupJoin
} from './desktopSyncGroupJoin.js';

afterEach(() => {
  vi.clearAllMocks();
  mocks.existingGroup = null;
  mocks.ownerDepth = 0;
  mocks.state = { candidates: [], pending: null };
});

it('requests a Device-scoped join without retired library or authorization metadata', async () => {
  mocks.state.candidates = [CANDIDATE];
  await requestDesktopSyncGroupJoin(CANDIDATE.endpoint_url);

  const request = mocks.requestJson.mock.calls[0]![1] as { body: string };
  expect(JSON.parse(request.body)).toEqual({
    contract_version: 1,
    device: {
      canonical_library_path: DEVICE.canonical_library_path,
      device_anchor: DEVICE.device_anchor,
      device_name: 'Desktop B', path_flavor: 'posix', platform: process.platform
    },
    ephemeral_public_key: 'public', group_id: 'group-1'
  });
  expect(request.body).not.toMatch(/authorization|library_facts|member|timeline/u);
  expect(mocks.savePending).toHaveBeenCalledOnce();
});

it('activates the provider Device route and initial coordinator after acceptance', async () => {
  mocks.state.pending = {
    candidate: CANDIDATE, key: { privateKey: 'private', publicKey: 'public' },
    request: { endpoint_url: CANDIDATE.endpoint_url, expires_at: '2026-08-27T00:02:00.000Z',
      group_id: 'group-1', request_id: 'request-1', status: 'pending' }
  };
  mocks.existingGroup = JOINED_GROUP;

  await completeDesktopSyncGroupJoin();

  expect(mocks.route).toHaveBeenCalledWith({
    endpoint_url: CANDIDATE.endpoint_url, group_id: 'group-1',
    local_device_id: DEVICE.identity_key, peer_device_id: CANDIDATE.provider_device_id,
    peer_device_name: CANDIDATE.provider_device_name, peer_platform: CANDIDATE.provider_platform
  });
  expect(mocks.coordinator).toHaveBeenCalledWith('initial', expect.any(Object));
});
