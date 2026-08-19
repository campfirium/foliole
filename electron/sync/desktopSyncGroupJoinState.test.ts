import { beforeEach, expect, it } from 'vitest';

import {
  loadDesktopSyncGroupJoinState,
  refreshDesktopSyncGroupPendingJoinEndpoint,
  saveDesktopSyncGroupPendingJoin
} from './desktopSyncGroupJoinState.js';

const privateKey = null as unknown as CryptoKey;

beforeEach(() => saveDesktopSyncGroupPendingJoin({
  candidate: {
    endpoint_url: 'http://192.168.1.12:41000', group_display_name: 'Office',
    group_id: 'group-1', group_tag: 'tag-1', provider_authorization_id: 'authorization-android-b',
    provider_device_id: 'android-b', provider_device_kind: 'android-capacitor',
    provider_device_name: 'A5', provider_host_name: 'A5', provider_host_platform: 'android-capacitor',
    timeline_id: 'timeline-1'
  },
  key: { privateKey, publicKey: 'public' },
  request: {
    endpoint_url: 'http://192.168.1.12:41000', expires_at: '2026-08-09T08:00:00.000Z',
    group_id: 'group-1', pair_request_id: 'pair-1', status: 'pending', timeline_id: 'timeline-1'
  }
}));

it('refreshes only the transport endpoint for the same pending provider identity', () => {
  expect(refreshDesktopSyncGroupPendingJoinEndpoint({
    endpointUrl: 'http://192.168.1.12:42000', groupId: 'group-1',
    providerAuthorizationId: 'authorization-android-b', timelineId: 'timeline-1'
  })).toBe(true);
  const pending = loadDesktopSyncGroupJoinState().pending;
  expect(pending?.candidate.endpoint_url).toBe('http://192.168.1.12:42000');
  expect(pending?.request.endpoint_url).toBe('http://192.168.1.12:42000');
  expect(pending?.request.pair_request_id).toBe('pair-1');
  expect(pending?.key).toEqual({ privateKey, publicKey: 'public' });
});

it.each([
  { groupId: 'other-group', providerAuthorizationId: 'authorization-android-b', timelineId: 'timeline-1' },
  { groupId: 'group-1', providerAuthorizationId: 'authorization-stranger', timelineId: 'timeline-1' }
])('rejects an advertisement outside the approved handshake identity', (identity) => {
  expect(refreshDesktopSyncGroupPendingJoinEndpoint({
    endpointUrl: 'http://192.168.1.99:42000', ...identity
  })).toBe(false);
  expect(loadDesktopSyncGroupJoinState().pending?.candidate.endpoint_url)
    .toBe('http://192.168.1.12:41000');
});

it('refreshes a pending provider route when only legacy timeline metadata changes', () => {
  expect(refreshDesktopSyncGroupPendingJoinEndpoint({
    endpointUrl: 'http://192.168.1.99:42000', groupId: 'group-1',
    providerAuthorizationId: 'authorization-android-b', timelineId: 'other-timeline'
  })).toBe(true);
});
