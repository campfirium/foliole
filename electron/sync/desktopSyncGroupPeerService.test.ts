import { expect, it } from 'vitest';

import { isCurrentGroupPeerService } from './desktopSyncGroupPeerService.js';

const group = { group_id: 'group-1', local_device_identity_key: 'desktop-a' };

it('distinguishes a peer from a stale local Device advertisement', () => {
  expect(isCurrentGroupPeerService({ txt: {
    device_id: 'desktop-a', group_id: 'group-1', runtime_instance_id: 'previous-runtime'
  } }, group)).toBe(false);
  expect(isCurrentGroupPeerService({ txt: {
    device_id: 'android-b', group_id: 'group-1', runtime_instance_id: 'remote-runtime'
  } }, group)).toBe(true);
  expect(isCurrentGroupPeerService({ txt: {
    provider_device_id: 'android-b', group_id: 'group-1', runtime_instance_id: 'mobile-runtime'
  } }, group)).toBe(true);
  expect(isCurrentGroupPeerService({ txt: {
    provider_device_id: 'desktop-a', group_id: 'group-1', runtime_instance_id: 'mobile-runtime'
  } }, group)).toBe(false);
  expect(isCurrentGroupPeerService({ txt: {
    group_id: 'group-1', runtime_instance_id: 'unknown-runtime'
  } }, group)).toBe(false);
  expect(isCurrentGroupPeerService({ txt: {
    device_id: 'other', group_id: 'group-2', runtime_instance_id: 'remote-runtime'
  } }, group)).toBe(false);
});
