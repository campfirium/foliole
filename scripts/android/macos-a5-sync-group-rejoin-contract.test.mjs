// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

vi.mock('./macos-pair-sync-desktop-session.mjs', () => ({
  macosPairSyncAuthorizationFingerprint: (value) => value
}));

import {
  assertT132CredentialRecoveryBaseline, assertT132MacBaseline, assertT132ProtectedBaseline,
  assertT132Rejoined, assertT132UnboundAfterRestart,
  validateT132DepartedMemberDesktop
} from './macos-a5-sync-group-rejoin-contract.mjs';
import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
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
  const foreground = { authorization: '2fdd44bb500a5934', reachable: true };
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
  localMemberAuthorizationFingerprint: '2fdd44bb500a5934', nodeCount: 1399,
  protectedContentDigest: 'digest-1', syncGroupCredentialsPresent: true,
  syncGroupId: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
  syncGroupPeerConflict: false, syncGroupRemotePeerFingerprint: 'a8ef578b118115cf',
  syncGroupRemotePeerPendingDeliveryCount: 0,
  syncGroupTimelineId: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9'
};

function macSession(pairedAuthorizationFingerprints = ['bff1f41963a42739']) {
  return { assertActive: vi.fn(), sanitize: vi.fn(() => ({
    localAuthorizationFingerprint: 'a8ef578b118115cf', pairedAuthorizationFingerprints,
    pendingAuthorizationFingerprints: [], serverState: 'running', syncEnabled: true
  })) };
}

function macOverview(memberHosts = ['A5', 'Mac', 'Offline'], pairedAuthorizations = [{}]) {
  return { paired_authorizations: pairedAuthorizations, pending_requests: [],
    server_status: { port: 38641, state: 'running' },
    sync_enabled: true, sync_group: {
      group_id: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
      timeline_id: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9',
      local_host_name: 'Mac',
      local_member_state: 'active', members: memberHosts.map((host_name) => ({
        authorization_id: `authorization-${host_name.toLowerCase()}`, host_name, state: 'active'
      }))
    }
  };
}

const a5AuthorizationFingerprint = authorizationFingerprint('authorization-a5');

it('protects the current Mac edge and the third offline member before Leave', () => {
  expect(assertT132ProtectedBaseline(baseline)).toBe(baseline);
  expect(assertT132ProtectedBaseline({
    ...baseline, localMemberAuthorizationFingerprint: 'bff1f41963a42739'
  })).toBeTruthy();
  expect(assertT132ProtectedBaseline({
    ...baseline, dirtyObjectCounts: {}, dirtyRecordCount: 0, nodeCount: 1405
  })).toBeTruthy();
  expect(assertT132ProtectedBaseline({
    ...baseline, dirtyObjectCounts: { setting: 3 }, dirtyRecordCount: 3
  })).toBeTruthy();
  expect(() => assertT132ProtectedBaseline({
    ...baseline, dirtyObjectCounts: { setting: 2 }, dirtyRecordCount: 3
  })).toThrow('protected T132-2 terminal baseline');
  expect(() => assertT132ProtectedBaseline({ ...baseline,
    syncGroupRemotePeerPendingDeliveryCount: 1
  })).toThrow('protected T132-2 terminal baseline');
  expect(assertT132ProtectedBaseline({ ...baseline,
    syncGroupRemotePeerPendingDeliveryCount: 1
  }, false)).toBeTruthy();
  expect(() => assertT132ProtectedBaseline({
    ...baseline, localMemberAuthorizationFingerprint: 'unrelated-authorization'
  })).toThrow('protected T132-2 terminal baseline');
});

it('protects the same data and roster while requiring explicit credential recovery', () => {
  const recovery = { ...baseline, syncGroupCredentialsPresent: false,
    syncGroupRemotePeerFingerprint: null };
  expect(assertT132CredentialRecoveryBaseline(recovery)).toBe(recovery);
  expect(assertT132CredentialRecoveryBaseline({
    ...recovery, dirtyObjectCounts: { setting: 3 }, dirtyRecordCount: 3
  })).toBeTruthy();
  expect(() => assertT132CredentialRecoveryBaseline({ ...recovery,
    activeSyncGroupMemberCount: 4
  })).toThrow('protected credential recovery baseline');
});

it('requires the isolated listener and exact inbound A5 credential before Leave', () => {
  const overview = macOverview();
  expect(assertT132MacBaseline(overview, macSession(), a5AuthorizationFingerprint)).toMatchObject({
    oldAuthorizationId: 'authorization-a5'
  });
  expect(assertT132MacBaseline(overview, macSession([]), a5AuthorizationFingerprint))
    .toMatchObject({ protectedHostName: 'A5' });
  expect(() => assertT132MacBaseline({ ...overview,
    server_status: { port: 38642, state: 'running' }
  }, macSession())).toThrow('fixed sync listener');
  expect(() => assertT132MacBaseline(overview, macSession(), authorizationFingerprint('missing')))
    .toThrow('protected three-member Sync Group baseline');
});

it('requires restart to clear group, credential, route, and progress without changing content', () => {
  expect(assertT132UnboundAfterRestart({
    currentDeliveryStatusCountsByPeerFingerprint: {},
    localMemberAuthorizationFingerprint: '2fdd44bb500a5934',
    dirtyObjectCounts: { node_text_alternative: 1 }, dirtyRecordCount: 1,
    nodeCount: 1399, protectedContentDigest: 'digest-1', syncGroupCredentialsPresent: false,
    syncGroupId: null, syncGroupRemotePeerFingerprint: null, syncGroupTimelineId: null
  }, baseline)).toBeTruthy();
});

it('admits only a fresh departed-member join and never requests disconnect repair', () => {
  const session = macSession([]);
  const overview = { paired_authorizations: [], pending_requests: [],
    server_status: { port: 38641, state: 'running' },
    sync_enabled: true, sync_group: {
      group_id: 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf',
      timeline_id: 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9',
      local_host_name: 'Mac',
      local_member_state: 'active', members: [
        { authorization_id: 'authorization-mac', host_name: 'Mac', state: 'active' },
        { authorization_id: 'authorization-offline', host_name: 'Offline', state: 'active' }
      ]
    }
  };
  expect(validateT132DepartedMemberDesktop(
    overview, session, 'A5', 'a8ef578b118115cf', false,
    a5AuthorizationFingerprint
  )).toMatchObject({ rePairRequired: false });
  expect(() => validateT132DepartedMemberDesktop(
    overview, session, 'A5', 'a8ef578b118115cf', true,
    a5AuthorizationFingerprint
  )).toThrow('exact departed-member rejoin boundary');
});

it('treats the rejoined roster as sufficient without a per-peer paired device record', () => {
  const overview = macOverview(undefined, []);
  expect(assertT132Rejoined({
    ...baseline, activeSyncGroupMemberCount: 3, syncGroupCredentialsPresent: true,
    localMemberAuthorizationFingerprint: a5AuthorizationFingerprint
  }, overview, macSession([]), 'revoked-authorization')).toMatchObject({
    newAuthorizationId: 'authorization-a5'
  });
});

it('freezes explicit success criteria and rejects every credential repair path', () => {
  const source = fs.readFileSync('scripts/android/macos-a5-sync-group-rejoin-action.mjs', 'utf8');
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
  expect(source).toContain('validateDesktop: (...args) => validateT132DepartedMemberDesktop');
  expect(source).toContain('authorizationFingerprint(oldAuthorizationId)');
  expect(source).toContain('Credential repair is outside the authorization cutover contract.');
  expect(source).toContain('desktopControl: async () =>');
  expect(source).toContain('instrumentationModeArgs: CREDENTIALS_ONLY_DISCOVERY_TARGET');
  expect(source).toContain("recoveryEvidenceGoal: 'credentials-signable'");
  expect(source).not.toContain('recoverExistingT132Credential');
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
