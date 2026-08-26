import fs from 'node:fs';

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

it('uses only the new request, complete, overview, group and Device production contract', () => {
  const source = fs.readFileSync('scripts/windows/windows-single-principal-sync-group-action.mjs', 'utf8');
  for (const command of [
    'request_sync_group_join', 'complete_sync_group_join', 'load_sync_group_overview'
  ]) expect(source).toContain(command);
  for (const retired of [
    'load_companion_pairing_overview', 'sync_group_members', 'paired_authorizations', 'manager'
  ]) expect(source).not.toContain(retired);
});
