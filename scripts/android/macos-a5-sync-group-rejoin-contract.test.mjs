// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('./macos-pair-sync-desktop-session.mjs', () => ({
  macosPairSyncIdentityFingerprint: (value) => value
}));

import {
  assertT132CredentialRecoveryBaseline, assertT132MacBaseline, assertT132ProtectedBaseline,
  assertT132Rejoined, assertT132UnboundAfterRestart,
  validateT132CredentialRecoveryDesktop, validateT132DepartedMemberDesktop
} from './macos-a5-sync-group-rejoin-contract.mjs';
import { collectStoppedReadiness } from './macos-a5-sync-group-rejoin-action.mjs';
import {
  assertT132A5ProviderAvailability
} from './macos-a5-sync-group-provider-acceptance.mjs';
import { assertLegacyTransitionRuntime } from './macos-a5-sync-group-transition-runtime.mjs';

it('collects post-rejoin readiness only while Android database writers are stopped', async () => {
  const events = [];
  const value = await collectStoppedReadiness({
    inspect: async () => { events.push('inspect'); return 'ready'; },
    start: async () => events.push('start'), stop: async () => events.push('stop')
  });
  expect(value).toBe('ready');
  expect(events).toEqual(['stop', 'inspect', 'start']);
});

it('proves provider reachability independently from the join-candidate selector', () => {
  const foreground = { identity: '2fdd44bb500a5934', reachable: true };
  expect(assertT132A5ProviderAvailability(foreground, true)).toBe(foreground);
  expect(assertT132A5ProviderAvailability(null, false)).toMatchObject({ reachable: false });
  expect(() => assertT132A5ProviderAvailability(null, true)).toThrow('not reachable');
  expect(() => assertT132A5ProviderAvailability(foreground, false)).toThrow('remained reachable');
});

const baseline = {
  activeSyncGroupMemberCount: 3,
  currentDeliveryStatusCountsByPeerFingerprint: {
    '512bececd879ce0f': { pending: 1 },
    a8ef578b118115cf: { accepted: 1 }
  },
  dirtyObjectCounts: { node_text_alternative: 1 }, dirtyRecordCount: 1,
  deviceIdentityFingerprint: '2fdd44bb500a5934', nodeCount: 1399,
  protectedContentDigest: 'digest-1', syncGroupCredentialsPresent: true,
  syncGroupId: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
  syncGroupPeerConflict: false, syncGroupRemotePeerFingerprint: 'a8ef578b118115cf',
  syncGroupRemotePeerPendingDeliveryCount: 0,
  syncGroupTimelineId: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9'
};

function macSession(pairedDeviceFingerprints = ['bff1f41963a42739']) {
  return { assertActive: vi.fn(), sanitize: vi.fn(() => ({
    desktopPeerFingerprint: 'a8ef578b118115cf', pairedDeviceFingerprints,
    pendingDeviceFingerprints: [], serverState: 'running', syncEnabled: true
  })) };
}

function macOverview(memberFingerprints, pairedDevices = [{}]) {
  return { paired_devices: pairedDevices, pending_requests: [],
    primary_device_state: { local_role: 'primary' }, server_status: { port: 38641, state: 'running' },
    sync_enabled: true, sync_group: {
      group_id: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
      timeline_id: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9',
      local_member_state: 'active', members: memberFingerprints.map((device_id, index) => ({
        authorization_id: `authorization-${index}`, device_id, state: 'active'
      }))
    }
  };
}

it('protects the current Mac edge and the third offline member before Leave', () => {
  expect(assertT132ProtectedBaseline(baseline)).toBe(baseline);
  expect(assertT132ProtectedBaseline({
    ...baseline, deviceIdentityFingerprint: 'bff1f41963a42739'
  })).toBeTruthy();
  expect(assertT132ProtectedBaseline({
    ...baseline, dirtyObjectCounts: {}, dirtyRecordCount: 0, nodeCount: 1405
  })).toBeTruthy();
  expect(() => assertT132ProtectedBaseline({ ...baseline,
    syncGroupRemotePeerPendingDeliveryCount: 1
  })).toThrow('protected T132-2 terminal baseline');
  expect(assertT132ProtectedBaseline({ ...baseline,
    syncGroupRemotePeerPendingDeliveryCount: 1
  }, false)).toBeTruthy();
  expect(() => assertT132ProtectedBaseline({
    ...baseline, deviceIdentityFingerprint: 'unrelated-device'
  })).toThrow('protected T132-2 terminal baseline');
});

it('protects the same data and roster while requiring explicit credential recovery', () => {
  const recovery = { ...baseline, syncGroupCredentialsPresent: false,
    syncGroupRemotePeerFingerprint: null };
  expect(assertT132CredentialRecoveryBaseline(recovery)).toBe(recovery);
  expect(() => assertT132CredentialRecoveryBaseline({ ...recovery,
    activeSyncGroupMemberCount: 4
  })).toThrow('protected credential recovery baseline');
  expect(validateT132CredentialRecoveryDesktop(macOverview([
    'bff1f41963a42739', 'a8ef578b118115cf', '512bececd879ce0f'
  ]), macSession(), '2fdd44bb500a5934', 'a8ef578b118115cf', false))
    .toMatchObject({ oldAuthorizationId: 'authorization-0', rePairRequired: true });
});

it('requires the isolated listener and exact inbound A5 credential before Leave', () => {
  const overview = macOverview([
    'bff1f41963a42739', 'a8ef578b118115cf', '512bececd879ce0f'
  ]);
  expect(assertT132MacBaseline(overview, macSession())).toMatchObject({
    oldAuthorizationId: 'authorization-0'
  });
  expect(() => assertT132MacBaseline(overview, macSession([]))).toThrow(
    'protected three-member Sync Group baseline'
  );
  expect(() => assertT132MacBaseline({ ...overview,
    server_status: { port: 38642, state: 'running' }
  }, macSession())).toThrow('fixed sync listener');
  expect(assertT132MacBaseline(macOverview([
    '2fdd44bb500a5934', 'a8ef578b118115cf', '512bececd879ce0f'
  ], []), macSession([]))).toMatchObject({
    oldAuthorizationId: 'authorization-0', protectedMemberIdentity: '2fdd44bb500a5934'
  });
});

it('requires restart to clear group, credential, route, and progress without changing content', () => {
  expect(assertT132UnboundAfterRestart({
    currentDeliveryStatusCountsByPeerFingerprint: {}, deviceIdentityFingerprint: '2fdd44bb500a5934',
    dirtyObjectCounts: { node_text_alternative: 1 }, dirtyRecordCount: 1,
    nodeCount: 1399, protectedContentDigest: 'digest-1', syncGroupCredentialsPresent: false,
    syncGroupId: null, syncGroupRemotePeerFingerprint: null, syncGroupTimelineId: null
  }, baseline)).toBeTruthy();
});

it('admits only a fresh departed-member join and never requests disconnect repair', () => {
  const session = macSession([]);
  const overview = { paired_devices: [], pending_requests: [],
    primary_device_state: { local_role: 'primary' }, server_status: { port: 38641, state: 'running' },
    sync_enabled: true, sync_group: {
      group_id: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
      timeline_id: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9',
      local_member_state: 'active', members: [
        { device_id: 'a8ef578b118115cf', state: 'active' },
        { device_id: '512bececd879ce0f', state: 'active' }
      ]
    }
  };
  expect(validateT132DepartedMemberDesktop(
    overview, session, '2fdd44bb500a5934', 'a8ef578b118115cf', false
  )).toMatchObject({ rePairRequired: false });
  expect(() => validateT132DepartedMemberDesktop(
    overview, session, '2fdd44bb500a5934', 'a8ef578b118115cf', true
  )).toThrow('exact departed-member rejoin boundary');
});

it('treats the rejoined roster as sufficient without a per-peer paired device record', () => {
  const overview = macOverview([
    '2fdd44bb500a5934', 'a8ef578b118115cf', '512bececd879ce0f'
  ], []);
  expect(assertT132Rejoined({
    ...baseline, activeSyncGroupMemberCount: 3, syncGroupCredentialsPresent: true
  }, overview, macSession([]), 'revoked-authorization')).toMatchObject({
    newAuthorizationId: 'authorization-0'
  });
});

it('freezes explicit success criteria and rejects every legacy repair path', () => {
  const source = fs.readFileSync('scripts/android/macos-a5-sync-group-rejoin-action.mjs', 'utf8');
  const recoverySource = fs.readFileSync(
    'scripts/android/macos-a5-sync-group-credential-recovery.mjs', 'utf8'
  );
  const targetSelection = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncTargetSelection.java',
    'utf8'
  );
  expect(source).toContain('restart_does_not_restore_group_credential_route_or_progress');
  expect(source).toContain('first_leave_uses_existing_formal_product_contract');
  expect(source).not.toContain('second_leave_proves_new_workgroup_contract_cleanup');
  expect(source.match(/action: 'leave-sync-group'/gu)).toHaveLength(1);
  expect(source).toContain('credentialRecoveryRequired');
  expect(source).toContain('dirtyObjectCounts: inspection.dirtyObjectCounts');
  expect(source).toContain('installMain: false');
  expect(source).toContain('await buildDesktop()');
  expect(source).toContain("existingPairing: false");
  expect(source).toContain("pairReceipt.pairingPath !== 'new'");
  expect(source).toContain('dirtyObjectCounts: {}');
  expect(source).toContain('dirtyRecordCount: 0');
  expect(source).toContain('validateDesktop: validateT132DepartedMemberDesktop');
  expect(source.match(/pairedDeviceFingerprint: null/gu)).toHaveLength(2);
  expect(recoverySource).toContain('pairRequestFingerprint: T132_A5_IDENTITY');
  expect(recoverySource).toContain('pairedDeviceFingerprint: T132_A5_LEGACY_MEMBER_IDENTITY');
  expect(recoverySource).not.toContain('approvalMembershipAction');
  expect(source).toContain('desktopControl: async () =>');
  expect(source).toContain('instrumentationModeArgs: CREDENTIALS_ONLY_DISCOVERY_TARGET');
  expect(source).toContain("recoveryEvidenceGoal: 'credentials-signable'");
  expect(recoverySource).toContain('validateDesktop: validateT132CredentialRecoveryDesktop');
  expect(recoverySource).not.toContain('existing-pair-disconnect');
  expect(targetSelection).toContain('expectedEndpointUrl.isEmpty()');
  expect(targetSelection).toContain('clickVisible');
});

it('freezes the pre-candidate product runtime without reading credential plaintext', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync('.tmp'), 't132-legacy-runtime-'));
  try {
    fs.mkdirSync(path.join(root, 'dist/electron'), { recursive: true });
    fs.mkdirSync(path.join(root, '.tmp/macos-desktop-daily-debug/user-data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/electron/main.js'), 'legacy product runtime');
    fs.writeFileSync(path.join(
      root, '.tmp/macos-desktop-daily-debug/user-data/companion-paired-devices.bin'
    ), new Uint8Array([1, 2, 3]));
    expect(assertLegacyTransitionRuntime(root)).toMatchObject({
      desktopMainDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      encryptedPairedStoreDigest: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
    fs.writeFileSync(path.join(root, 'dist/electron/main.js'), 'workgroup-aead-v1');
    expect(() => assertLegacyTransitionRuntime(root)).toThrow('replaced by the candidate');
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
