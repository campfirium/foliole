// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS } from
  '../../lib/core/database/syncGroupUnifiedSchemaStatements.js';
import { SyncGroupLifecycleAuthority } from '../../lib/core/sync/syncGroupLifecycleAuthority.js';
import { SyncGroupLifecycleStore } from '../../lib/core/sync/syncGroupLifecycleStore.js';
import type { SyncGroupJoinApplication } from '../../lib/platform/syncGroupLifecycleContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const connections: Database.Database[] = [];

afterEach(() => {
  while (connections.length) connections.pop()?.close();
});

it('keeps waiting durable and permits only the immutable manager to create roster revisions', async () => {
  const fixture = createFixture();
  const memberStore = new SyncGroupLifecycleStore(fixture.port);
  await memberStore.saveJoinApplication(application('request-ios', 'waiting'));
  expect((await new SyncGroupLifecycleStore(fixture.port).loadJoinApplication('request-ios'))?.state).toBe('waiting');

  await expect(fixture.authority.receiveJoinApplication('member-ordinary', application('request-denied', 'pending')))
    .rejects.toThrow('manager_required');
  expect(await memberStore.loadJoinApplication('request-denied')).toBeNull();

  await fixture.authority.receiveJoinApplication('member-manager', application('request-ios', 'waiting'));
  const first = await fixture.authority.approveJoinApplication(approval('request-ios', 'member-ios', 1));
  expect(first.roster).toMatchObject({ manager_member_id: 'member-manager', roster_revision: 1 });
  expect(first.grant).toMatchObject({ authorization_epoch: 1, local_member_id: 'member-ios', state: 'pending' });

  await fixture.authority.leaveMember('member-ios', 'departure-ios', NOW);
  await fixture.authority.receiveJoinApplication('member-manager', application('request-rejoin', 'pending', 'member-ios'));
  const rejoin = await fixture.authority.approveJoinApplication(approval('request-rejoin', 'unused-new-id', 2));
  expect(rejoin.grant).toMatchObject({ authorization_epoch: 2, local_member_id: 'member-ios' });
  expect(rejoin.roster?.members.filter((member) => member.installation_id === 'installation-ios'))
    .toHaveLength(1);
});

it('commits departures before success and rejects manager retirement while members remain', async () => {
  const fixture = createFixture();
  await fixture.authority.receiveJoinApplication('member-manager', application('request-ios', 'pending'));
  await fixture.authority.approveJoinApplication(approval('request-ios', 'member-ios', 1));

  await expect(fixture.authority.leaveMember('member-manager', 'retire-blocked', NOW))
    .rejects.toThrow('manager_has_active_members');
  expect(fixture.sqlite.prepare("SELECT state FROM sync_groups WHERE group_id = 'group-a'").pluck().get()).toBe('active');

  fixture.sqlite.exec(`CREATE TRIGGER fail_leave BEFORE INSERT ON sync_group_departure_outbox
    WHEN NEW.departure_id = 'departure-fault' BEGIN SELECT RAISE(ABORT, 'injected departure fault'); END`);
  await expect(fixture.authority.leaveMember('member-ios', 'departure-fault', NOW)).rejects.toThrow();
  expect(fixture.sqlite.prepare(`SELECT state FROM sync_group_members
    WHERE group_id = 'group-a' AND member_id = 'member-ios'`).pluck().get()).toBe('active');
  fixture.sqlite.exec('DROP TRIGGER fail_leave');

  const revoked = await fixture.authority.revokeMember('member-manager', 'member-ios', 'revoke-ios', NOW);
  expect(revoked).toMatchObject({ committed: true, roster_revision: 2, state: 'revoked' });
  await fixture.authority.recordDepartureFailure('revoke-ios', 'manager_offline', NOW);
  expect(fixture.sqlite.prepare(`SELECT state, last_error FROM sync_group_departure_outbox
    WHERE departure_id = 'revoke-ios'`).get()).toEqual({ state: 'pending', last_error: 'manager_offline' });

  await fixture.authority.revokeMember('member-manager', 'member-ordinary', 'revoke-ordinary', NOW);

  const retired = await fixture.authority.leaveMember('member-manager', 'retire-manager', NOW);
  expect(retired).toMatchObject({ committed: true, roster_revision: 4, state: 'retired' });
  expect(fixture.sqlite.prepare("SELECT state FROM sync_groups WHERE group_id = 'group-a'").pluck().get()).toBe('retired');
});

const NOW = '2026-08-26T01:00:00.000Z';

function createFixture() {
  const sqlite = new Database(':memory:');
  connections.push(sqlite);
  sqlite.pragma('foreign_keys = ON');
  for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  sqlite.prepare(`INSERT INTO sync_groups
    (group_id, timeline_id, display_name, manager_member_id, roster_revision, state, created_at, updated_at)
    VALUES ('group-a', 'timeline-a', 'Group A', 'member-manager', 0, 'active', ?, ?)`).run(NOW, NOW);
  sqlite.prepare(`INSERT INTO sync_group_members
    (group_id, member_id, installation_id, display_name, host_platform, role, state, identity_state,
     authorization_id, authorization_epoch, joined_at, updated_at)
    VALUES ('group-a', 'member-manager', 'installation-manager', 'Manager', 'darwin', 'manager',
      'active', 'verified', 'authorization-manager', 1, ?, ?),
     ('group-a', 'member-ordinary', 'installation-ordinary', 'Provider', 'android', 'member',
      'active', 'verified', 'authorization-ordinary', 1, ?, ?)`).run(NOW, NOW, NOW, NOW);
  sqlite.prepare(`INSERT INTO sync_group_member_authorizations
    (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
    VALUES ('group-a', 'member-manager', 'authorization-manager', 1, 'active', ?),
      ('group-a', 'member-ordinary', 'authorization-ordinary', 1, 'active', ?)`).run(NOW, NOW);
  sqlite.prepare(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_member_id, installation_id, member_state, updated_at)
    VALUES (1, 'group-a', 'member-manager', 'installation-manager', 'active', ?)`).run(NOW);
  const port = createBetterSqliteDbPort(sqlite, { name: 'sync-group-lifecycle-test' });
  return { authority: new SyncGroupLifecycleAuthority(port), port, sqlite };
}

function application(
  requestId: string, state: SyncGroupJoinApplication['state'], previousMemberId: string | null = null
): SyncGroupJoinApplication {
  return { application_public_key: 'public-key', created_at: NOW, group_id: 'group-a',
    installation_id: 'installation-ios', library_facts: { library_id: 'isolated-ios' },
    previous_member_id: previousMemberId, protocol_version: 4, request_id: requestId,
    requested_display_name: 'Acceptance iPhone', requested_platform: 'ios', state,
    timeline_id: 'timeline-a', updated_at: NOW };
}

function approval(requestId: string, memberId: string, epoch: number) {
  return { actor_member_id: 'member-manager', authorization_id: `authorization-ios-${epoch}`,
    encrypted_route_secret: { algorithm: 'fixture', ciphertext: `secret-${epoch}` },
    grant_id: `grant-ios-${epoch}`, member_id: memberId, now: NOW,
    request_id: requestId, route_id: `route-ios-${epoch}` };
}
