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
    group_id: 'group-1', provider_device_id: 'android-b', provider_device_kind: 'android-capacitor',
    provider_device_name: 'A5', timeline_id: 'timeline-1'
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
    providerDeviceId: 'android-b', timelineId: 'timeline-1'
  })).toBe(true);
  const pending = loadDesktopSyncGroupJoinState().pending;
  expect(pending?.candidate.endpoint_url).toBe('http://192.168.1.12:42000');
  expect(pending?.request.endpoint_url).toBe('http://192.168.1.12:42000');
  expect(pending?.request.pair_request_id).toBe('pair-1');
  expect(pending?.key).toEqual({ privateKey, publicKey: 'public' });
});

it.each([
  { groupId: 'other-group', providerDeviceId: 'android-b', timelineId: 'timeline-1' },
  { groupId: 'group-1', providerDeviceId: 'stranger', timelineId: 'timeline-1' },
  { groupId: 'group-1', providerDeviceId: 'android-b', timelineId: 'other-timeline' }
])('rejects an advertisement outside the approved handshake identity', (identity) => {
  expect(refreshDesktopSyncGroupPendingJoinEndpoint({
    endpointUrl: 'http://192.168.1.99:42000', ...identity
  })).toBe(false);
  expect(loadDesktopSyncGroupJoinState().pending?.candidate.endpoint_url)
    .toBe('http://192.168.1.12:41000');
});
