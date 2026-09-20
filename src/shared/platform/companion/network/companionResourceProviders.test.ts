import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ group: vi.fn(), blocked: vi.fn(async () => false), discovery: vi.fn(),
  nativeCandidates: vi.fn(), exchange: vi.fn(), post: vi.fn() }));
vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: mocks.group }));
vi.mock('../sync/syncGroupMemberStateStore', () => ({ isCompanionSyncGroupDeviceBlocked: mocks.blocked }));
vi.mock('./companionSyncGroupMemberState', () => ({ exchangeCompanionSyncGroupMemberState: mocks.exchange }));
vi.mock('../../companionDesktopSyncHttp', () => ({ postDesktopJson: mocks.post }));
vi.mock('../../companionWorkspaceDiscovery', () => ({ loadCompanionDiscoveryCandidates: mocks.discovery }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  normalizeEndpointUrl: (value: string) => value.replace(/\/+$/, ''),
  FolioleCompanionSync: { loadDiscoveryCandidates: mocks.nativeCandidates }
}));

import { loadCompanionResourceProviders, runCompanionResourceProviderBatch } from './companionResourceProviders';

const need = { kind: 'attachment' as const, id: 'a'.repeat(64) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.group.mockResolvedValue({ group_id: 'group', local_device_identity_key: 'local', devices:
    ['local','anchor','member','mobile','offline','removed'].map((device_identity_key) => ({ device_identity_key, state: 'active' })) });
  mocks.blocked.mockImplementation(async (_group?: string, id?: string) => id === 'removed');
  mocks.nativeCandidates.mockResolvedValue({ candidates: ['anchor','member','mobile','removed'].map((id) => ({ endpoint_url: `http://${id}` })) });
  mocks.discovery.mockResolvedValue(['anchor','member','mobile','removed','unknown'].map((id) => ({
    endpointUrl: `http://${id}`, compatibility: { status: 'compatible' },
    discovery: { group_id: 'group', provider_device_id: id }
  })));
  mocks.exchange.mockResolvedValue({ localExited: false, peerRemoved: false });
  mocks.post.mockImplementation(async (endpoint: string) => ({ provider_device_id: endpoint.slice(7),
    resources: [{ ...need, status: endpoint === 'http://anchor' ? 'missing' : 'available', sha256: need.id, size_bytes: 3 }] }));
});

it('uses all native discovered members rather than the anchor-only discovery projection', async () => {
  const peers = await loadCompanionResourceProviders('http://anchor/');
  expect(peers.providers.map((provider) => provider.deviceId)).toEqual(['anchor','member','mobile']);
  expect(peers.eligibleDeviceIds).toContain('offline');
  expect(mocks.discovery.mock.calls[0]?.[0].map((candidate: { endpointUrl: string }) => candidate.endpointUrl))
    .toEqual(['http://anchor','http://member','http://mobile','http://removed']);
});

it('exchanges member state before availability and changes provider after a 404', async () => {
  const transfer = vi.fn(async (endpoint: string) => endpoint === 'http://member'
    ? { ready: [], errors: { [`attachment:${need.id}`]: 'missing_file' as const } }
    : { ready: [`attachment:${need.id}`], errors: {} });
  const result = await runCompanionResourceProviderBatch({ endpointUrl: 'http://anchor', needs: [need], transfer });
  expect(result.ready).toEqual([`attachment:${need.id}`]);
  expect(transfer.mock.calls.map(([endpoint]) => endpoint)).toEqual(['http://member','http://mobile']);
  expect(mocks.exchange.mock.invocationCallOrder[0]).toBeLessThan(mocks.post.mock.invocationCallOrder[0]!);
});

it('keeps failed member-state authorization unknown and does not query or transfer data', async () => {
  mocks.exchange.mockRejectedValue(new Error('sync_group_member_state_failed_401'));
  const transfer = vi.fn();
  const result = await runCompanionResourceProviderBatch({ endpointUrl: 'http://anchor', needs: [need], transfer });
  expect(mocks.post).not.toHaveBeenCalled();
  expect(transfer).not.toHaveBeenCalled();
  expect(result.unresolvedState).toBe('unknown');
  expect(result.issues.every((issue) => issue.error === 'authentication_failed')).toBe(true);
});
