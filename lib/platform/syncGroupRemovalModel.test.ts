import { expect, it } from 'vitest';

import type { SyncGroupDevicePayload } from './syncGroupContract.js';
import type { SyncGroupRemovalDecisionPayload } from './syncGroupMemberStateContract.js';
import { eligibleSyncGroupRemovals, parseSyncGroupRemovingEntries, syncGroupRemovingEntries } from './syncGroupRemovalModel.js';

const devices: SyncGroupDevicePayload[] = ['A', 'B', 'C', 'D', 'E'].map(id => ({
  device_identity_key: id, device_name: id, canonical_library_path: `/private/${id}`,
  contract_version: 1, device_anchor: `${id}-anchor`, joined_at: 'now', last_seen_at: null,
  left_at: null, platform: 'darwin', state: 'active', updated_at: 'now'
}));
function removal(id: string, target: string, confirmed: string[]): SyncGroupRemovalDecisionPayload {
  return { decision_id: id, target_device_identity_key: target, initiated_by_device_identity_key: 'A',
    completed_at: null, superseded_at: null, created_at: 'now', confirmations: confirmed.map(device => ({
      confirming_device_identity_key: device, confirmed_at: 'now', kind: 'enforced'
    })) };
}
it('requires every remaining device on each decision and never pools concurrent evidence', () => {
  const first = removal('one', 'D', ['A', 'B']);
  const second = removal('two', 'D', ['A', 'C']);
  const otherTarget = removal('three', 'E', ['A', 'B', 'C']);
  expect(eligibleSyncGroupRemovals(devices, [first, second, otherTarget]).map(item => item.decision_id)).toEqual(['three']);
  const rows = syncGroupRemovingEntries(devices, [first, second, otherTarget]);
  expect(rows).toHaveLength(2);
  expect(rows[0]?.confirmed_devices.map(device => device.device_name)).toEqual(['A', 'B']);
});
it('adds new remaining members to the required confirmations and hides confirmers later removed', () => {
  const first = removal('one', 'D', ['A', 'B', 'C']);
  expect(eligibleSyncGroupRemovals(devices.slice(0, 4), [first])).toEqual([first]);
  expect(eligibleSyncGroupRemovals(devices, [first])).toEqual([]);
  const rows = syncGroupRemovingEntries(devices, [first, removal('two', 'B', ['A'])]);
  expect(rows.find(row => row.target.device_identity_key === 'D')?.confirmed_devices.map(device => device.device_name))
    .toEqual(['A', 'C']);
});
it('does not trust target-exit, retains pending rows for departed targets, and hides completed targets', () => {
  const first = removal('one', 'D', ['A']);
  first.confirmations.push({ confirming_device_identity_key: 'D', kind: 'target_exit', confirmed_at: 'now' });
  expect(eligibleSyncGroupRemovals(devices, [first])).toEqual([]);
  const departed = devices.map(device => device.device_identity_key === 'D' ? { ...device, state: 'left' as const } : device);
  expect(syncGroupRemovingEntries(departed, [first])).toHaveLength(1);
  expect(syncGroupRemovingEntries(devices, [first, { ...first, decision_id: 'two', completed_at: 'later' }])).toEqual([]);
});
it('distinguishes same-name identities without exposing library paths and rejects malformed overview entries', () => {
  const sameNames = devices.map(device => ({ ...device, device_name: 'Mac' }));
  const entries = syncGroupRemovingEntries(sameNames, [removal('one', 'D', ['A', 'B'])]);
  expect(new Set([entries[0]?.target.device_name, ...entries[0]!.confirmed_devices.map(device => device.device_name)]).size).toBe(3);
  expect(JSON.stringify(entries)).not.toContain('/private/');
  expect(parseSyncGroupRemovingEntries([...entries, null, { target: {}, confirmed_devices: [5] }])).toEqual(entries);
});
