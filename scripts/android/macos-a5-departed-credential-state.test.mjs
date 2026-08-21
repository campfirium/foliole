// @vitest-environment node

import { DatabaseSync } from 'node:sqlite';

import { expect, it } from 'vitest';

import {
  departedCredentialFixture, departedWorkspaceFixture
} from './android-departed-credential-fixture.mjs';
import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import {
  assertDepartedCredentialBaseline, classifyDepartedCredentialState,
  DEPARTED_PRESERVED_HISTORY
} from './macos-a5-departed-credential-state.mjs';
import { inspectDesktopDepartureBoundary } from './macos-a5-desktop-departure-inspection.mjs';

it('admits only the exact departed-preserved-history matrix', () => {
  expect(classifyDepartedCredentialState(
    departedCredentialFixture, departedWorkspaceFixture
  )).toBe(DEPARTED_PRESERVED_HISTORY);
  const rejected = [
    ['missing departure', { storedLocalDepartureMatchCount: 0 }],
    ['current binding', { syncGroupId: 'group-1' }],
    ['workgroup key', { workgroupKeyPresent: true }],
    ['peer route', { syncGroupRoutePresent: true }],
    ['pairing credential', { pairingCredentialsPresent: true }],
    ['multiple groups', { storedSyncGroupCount: 2 }],
    ['multiple departures', { storedLocalDepartureMatchCount: 2 }]
  ];
  for (const [, change] of rejected) {
    expect(classifyDepartedCredentialState(
      { ...departedCredentialFixture, ...change }, departedWorkspaceFixture
    )).toBeNull();
  }
  expect(classifyDepartedCredentialState(departedCredentialFixture, {
    ...departedWorkspaceFixture,
    pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: false }
  })).toBeNull();
});

it('rejects protected identity, content, and dirty-state drift', () => {
  const baseline = { dirtyObjectCounts: {}, dirtyRecordCount: 0,
    groupId: 'group-1', nodeCount: 0,
    localMemberAuthorizationFingerprint:
      departedCredentialFixture.storedLocalMemberAuthorizationFingerprint,
    protectedContentDigest: 'a'.repeat(64), timelineId: 'timeline-1' };
  expect(assertDepartedCredentialBaseline(departedCredentialFixture, baseline))
    .toBe(departedCredentialFixture);
  for (const change of [
    { storedLocalMemberAuthorizationFingerprint: '0000000000000000' },
    { protectedContentDigest: 'b'.repeat(64) },
    { dirtyRecordCount: 1 }
  ]) {
    expect(() => assertDepartedCredentialBaseline(
      { ...departedCredentialFixture, ...change }, baseline
    )).toThrow('did not preserve');
  }
});

function desktopDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE sync_groups (group_id TEXT, timeline_id TEXT);
    CREATE TABLE sync_group_local_state (singleton_id INTEGER, group_id TEXT,
      local_host_name TEXT, member_state TEXT);
    CREATE TABLE sync_group_members (group_id TEXT, host_name TEXT, state TEXT,
      authorization_id TEXT);
    CREATE TABLE sync_group_member_departures (group_id TEXT, host_name TEXT,
      authorization_id TEXT);
    INSERT INTO sync_groups VALUES ('group-1', 'timeline-1');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'host-desktop', 'active');
    INSERT INTO sync_group_members VALUES
      ('group-1', 'host-desktop', 'active', 'authorization-desktop'),
      ('group-1', 'host-a5', 'left', 'authorization-a5');
    INSERT INTO sync_group_member_departures VALUES ('group-1', 'host-a5', 'leave-a5');`);
  return db;
}

it('matches the same departed authorization on Desktop without exposing raw identifiers', () => {
  const result = inspectDesktopDepartureBoundary('/library', departedCredentialFixture,
    () => desktopDatabase());
  expect(result).toEqual({
    groupId: 'group-1',
    remotePeerAuthorizationFingerprint: authorizationFingerprint('authorization-desktop'),
    timelineId: 'timeline-1'
  });
  expect(JSON.stringify(result)).not.toContain('authorization-desktop');
  expect(() => inspectDesktopDepartureBoundary('/library', {
    ...departedCredentialFixture,
    storedLocalDepartureAuthorizationFingerprint: '0000000000000000'
  }, () => desktopDatabase())).toThrow('matching protected A5 departure');
});
