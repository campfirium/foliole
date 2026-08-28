import { beforeEach, expect, it, vi } from 'vitest';

import {
  IOS_HOSTED_PROVIDER_DEVICE_ID,
  IOS_HOSTED_SYNC_GROUP_ID
} from '../../lib/platform/iosHostedSyncGroupContract';
import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  serializeSyncProtocolTxt
} from '../../lib/platform/syncProtocolContract';

const runtime = vi.hoisted(() => ({ discover: vi.fn(), group: vi.fn(), key: vi.fn(), load: vi.fn() }));

vi.mock('../shared/platform/companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { loadDiscoveryCandidates: runtime.discover }
}));
vi.mock('../shared/platform/companionWorkspaceDiscovery', () => ({
  loadCompanionDiscoveryCandidates: runtime.load
}));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: runtime.group,
  loadCompanionSyncGroupWorkgroupKey: runtime.key
}));

import { discoverIosHostedProvider, ensureIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';

const endpointUrl = 'http://hosted-provider.local:43123';
const runtimeId = 'runtime-attempt-1';
const groupTag = 'a'.repeat(32);
const discovery = {
  group_id: IOS_HOSTED_SYNC_GROUP_ID,
  group_tag: groupTag,
  protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  provider_device_id: IOS_HOSTED_PROVIDER_DEVICE_ID,
  provider_device_name: 'Acceptance Provider',
  provider_platform: 'macOS',
  runtime_instance_id: runtimeId
};
const protocolTxt = {
  ...serializeSyncProtocolTxt(),
  device_id: IOS_HOSTED_PROVIDER_DEVICE_ID,
  group_id: IOS_HOSTED_SYNC_GROUP_ID,
  group_tag: groupTag,
  runtime_instance_id: runtimeId
};

beforeEach(() => {
  vi.clearAllMocks();
  runtime.discover.mockResolvedValue({ candidates: [{
    endpoint_url: endpointUrl, protocol_txt: protocolTxt, source: 'nsd'
  }] });
  runtime.load.mockResolvedValue([{ discovery, endpointUrl }]);
  runtime.group.mockResolvedValue(null);
  runtime.key.mockResolvedValue(null);
});

it('accepts exactly one Network.framework candidate whose TXT and HTTP identity match', async () => {
  await expect(discoverIosHostedProvider()).resolves.toMatchObject({ discovery, endpointUrl });
  expect(runtime.load).toHaveBeenCalledWith([{
    endpointUrl, protocolTxt, source: 'nsd'
  }]);
});

it.each([
  ['missing registration', []],
  ['direct endpoint injection', [{ endpoint_url: endpointUrl, protocol_txt: protocolTxt, source: 'direct' }]],
  ['wrong TXT port owner', [{ endpoint_url: endpointUrl, protocol_txt: {
    ...protocolTxt, runtime_instance_id: 'another-runtime'
  }, source: 'nsd' }]],
  ['wrong TXT group', [{ endpoint_url: endpointUrl, protocol_txt: {
    ...protocolTxt, group_id: 'another-group'
  }, source: 'nsd' }]]
])('fails closed for %s', async (_label, candidates) => {
  runtime.discover.mockResolvedValue({ candidates });
  await expect(discoverIosHostedProvider()).rejects.toThrow('ios_hosted_sync_group_discovery_count_0');
});

it('rejects multiple exact hosted providers', async () => {
  const secondEndpoint = 'http://hosted-provider.local:43124';
  runtime.discover.mockResolvedValue({ candidates: [
    { endpoint_url: endpointUrl, protocol_txt: protocolTxt, source: 'nsd' },
    { endpoint_url: secondEndpoint, protocol_txt: protocolTxt, source: 'nsd' }
  ] });
  runtime.load.mockResolvedValue([
    { discovery, endpointUrl }, { discovery, endpointUrl: secondEndpoint }
  ]);
  await expect(discoverIosHostedProvider()).rejects.toThrow('ios_hosted_sync_group_discovery_count_2');
});

it('rejects a restored group whose persisted key does not derive the advertised tag', async () => {
  runtime.group.mockResolvedValue({ group_id: IOS_HOSTED_SYNC_GROUP_ID });
  runtime.key.mockResolvedValue('YQ');
  await expect(ensureIosAcceptanceSyncGroup('/acceptance.db'))
    .rejects.toThrow('sync_group_identity_mismatch');
});
