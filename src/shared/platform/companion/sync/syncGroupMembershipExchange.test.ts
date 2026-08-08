import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(), http: vi.fn(), load: vi.fn(), merge: vi.fn()
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { desktopHttpRequest: mocks.http }
}));
vi.mock('../network/signedRequest', () => ({ createSignedRequestHeaders: mocks.headers }));
vi.mock('./syncGroupStore', () => ({
  loadCompanionSyncGroup: mocks.load,
  mergeActiveCompanionSyncGroupMembership: mocks.merge
}));

import { exchangeCompanionSyncGroupMembership } from './syncGroupMembershipExchange';

beforeEach(() => {
  mocks.headers.mockReset().mockResolvedValue({ 'X-Device-Id': 'mobile-b' });
  mocks.http.mockReset();
  mocks.merge.mockReset().mockResolvedValue({ group_id: 'group-1' });
  mocks.load.mockReset().mockResolvedValue({
    group_id: 'group-1', local_member_state: 'active', members: []
  });
});

it('submits the local group on the endpoint-specific signed channel and merges the response', async () => {
  const responseGroup = { group_id: 'group-1', local_device_id: 'desktop-a', members: [] };
  mocks.http.mockResolvedValue({ body: JSON.stringify({ sync_group: responseGroup }), status: 200 });
  await expect(exchangeCompanionSyncGroupMembership('http://desktop-a:38641'))
    .resolves.toEqual({ group_id: 'group-1' });
  expect(mocks.headers).toHaveBeenCalledWith(expect.objectContaining({
    endpointUrl: 'http://desktop-a:38641', pathWithQuery: '/companion/sync-group/membership'
  }));
  expect(mocks.merge).toHaveBeenCalledWith(responseGroup);
});

it('does not exchange membership while local provisioning is incomplete', async () => {
  mocks.load.mockResolvedValue({ group_id: 'group-1', local_member_state: 'provisioning' });
  await expect(exchangeCompanionSyncGroupMembership('http://desktop-a:38641')).resolves.toEqual(
    { group_id: 'group-1', local_member_state: 'provisioning' }
  );
  expect(mocks.http).not.toHaveBeenCalled();
});
