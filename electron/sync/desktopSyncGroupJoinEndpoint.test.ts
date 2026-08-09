import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  candidates: [] as Array<Record<string, string>>,
  pending: null as null | { candidate: Record<string, string> },
  refresh: vi.fn(() => true)
}));

vi.mock('./desktopSyncGroupDiscovery.js', () => ({
  discoverDesktopSyncGroups: async () => runtime.candidates
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: () => ({ pending: runtime.pending }),
  refreshDesktopSyncGroupPendingJoinEndpoint: runtime.refresh
}));

import { refreshDesktopSyncGroupPendingJoinFromDiscovery } from './desktopSyncGroupJoinEndpoint.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.pending = { candidate: {
    endpoint_url: 'http://192.168.1.12:41000', group_id: 'group-1',
    provider_device_id: 'android-b', timeline_id: 'timeline-1'
  } };
  runtime.candidates = [];
});

it('selects the new endpoint for the exact approved provider identity', async () => {
  runtime.candidates = [
    { endpoint_url: 'http://192.168.1.99:43000', group_id: 'group-1',
      provider_device_id: 'stranger', timeline_id: 'timeline-1' },
    { endpoint_url: 'http://192.168.1.12:42000', group_id: 'group-1',
      provider_device_id: 'android-b', timeline_id: 'timeline-1' }
  ];
  expect(await refreshDesktopSyncGroupPendingJoinFromDiscovery()).toBe(true);
  expect(runtime.refresh).toHaveBeenCalledWith({
    endpointUrl: 'http://192.168.1.12:42000', groupId: 'group-1',
    providerDeviceId: 'android-b', timelineId: 'timeline-1'
  });
});

it('does not redirect the handshake to an unapproved discovery identity', async () => {
  runtime.candidates = [{
    endpoint_url: 'http://192.168.1.99:43000', group_id: 'group-1',
    provider_device_id: 'stranger', timeline_id: 'timeline-1'
  }];
  expect(await refreshDesktopSyncGroupPendingJoinFromDiscovery()).toBe(false);
  expect(runtime.refresh).not.toHaveBeenCalled();
});
