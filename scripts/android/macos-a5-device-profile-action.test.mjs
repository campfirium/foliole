// @vitest-environment node

import { expect, it } from 'vitest';

import { assertA5DeviceProfileAcceptance } from './macos-a5-device-profile-action.mjs';

function snapshot(hostName, localGroupCount = 0) {
  return {
    attachments: { sha256: 'attachments' },
    database: {
      counts: { nodes: 3, review_log: 2, sync_group_local_state: localGroupCount },
      exists: true,
      inspection: { hostName, protectedContentDigest: 'content' },
      integrity: 'ok'
    }
  };
}

it('accepts the Android system profile only when content and restart facts remain stable', () => {
  const result = assertA5DeviceProfileAcceptance({
    baseline: snapshot('android-legacy', 1), expectedProfile: 'BOOX Palma 2',
    first: snapshot('BOOX Palma 2'), pairing: { pairingCredentialsPresent: false },
    second: snapshot('BOOX Palma 2')
  });
  expect(result.after.deviceProfile).toBe('BOOX Palma 2');
});

it('treats absent and newly created empty content tables as the same protected content', () => {
  const baseline = snapshot('android-legacy', 1);
  delete baseline.database.counts.review_log;
  const first = snapshot('BOOX Palma 2');
  const second = snapshot('BOOX Palma 2');
  first.database.counts.review_log = 0;
  second.database.counts.review_log = 0;
  const result = assertA5DeviceProfileAcceptance({
    baseline, expectedProfile: 'BOOX Palma 2', first,
    pairing: { pairingCredentialsPresent: false }, second
  });
  expect(result.after.content).toEqual(result.before.content);
});

it('rejects a copied identity, retained local binding, or changed content', () => {
  expect(() => assertA5DeviceProfileAcceptance({
    baseline: snapshot('android-legacy', 1), expectedProfile: 'BOOX Palma 2',
    first: snapshot('android-legacy'), pairing: { pairingCredentialsPresent: false },
    second: snapshot('android-legacy')
  })).toThrow('does not match');
  expect(() => assertA5DeviceProfileAcceptance({
    baseline: snapshot('android-legacy', 1), expectedProfile: 'BOOX Palma 2',
    first: snapshot('BOOX Palma 2', 1), pairing: { pairingCredentialsPresent: false },
    second: snapshot('BOOX Palma 2', 1)
  })).toThrow('binding remained active');
  const changed = snapshot('BOOX Palma 2');
  changed.database.inspection.protectedContentDigest = 'changed';
  expect(() => assertA5DeviceProfileAcceptance({
    baseline: snapshot('android-legacy', 1), expectedProfile: 'BOOX Palma 2',
    first: changed, pairing: { pairingCredentialsPresent: false }, second: changed
  })).toThrow('content or historical source facts changed');
});
