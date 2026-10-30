import { expect, it } from 'vitest';

import {
  assertJoinedWindowsGroup
} from './windows-single-principal-sync-group-contract.mjs';

const group = {
  devices: [{ device_identity_key: 'device-windows' }, { device_identity_key: 'device-mac' }],
  group_id: 'group-1', local_device_identity_key: 'device-windows'
};

it('requires the restarted Windows local Device in the accepted group', () => {
  expect(assertJoinedWindowsGroup({ sync_group: group }, 'group-1')).toBe(group);
  expect(() => assertJoinedWindowsGroup({ sync_group: {
    ...group, devices: [{ device_identity_key: 'device-mac' }]
  } }, 'group-1')).toThrow('local Device');
  expect(() => assertJoinedWindowsGroup({ sync_group: group }, 'other')).toThrow('local Device');
});
