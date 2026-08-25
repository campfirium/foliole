import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS } from
  '../../../../../lib/core/database/syncGroupUnifiedSchemaStatements';
import { SyncGroupLifecycleStore } from '../../../../../lib/core/sync/syncGroupLifecycleStore';
import type { SyncGroupJoinApplication } from '../../../../../lib/platform/syncGroupLifecycleContract';
import { createCapacitorSqliteDbPort } from '../../capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';

import {
  consumePreparedRouteGrant,
  persistPreparedJoinIntent,
  type SyncGroupLifecycleSecureRoutePort
} from './companionSyncGroupLifecyclePrepare';

let sqlite: Database.Database | null = null;

afterEach(() => {
  sqlite?.close();
  sqlite = null;
});

it('persists waiting intents and consumes only a newer roster from the verified manager route', async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  seedMemberClient(sqlite);
  const connection = createFakeCapacitorConnection(sqlite);
  const first = new SyncGroupLifecycleStore(createCapacitorSqliteDbPort(connection as never, 'ios'));
  await first.saveJoinApplication(application());

  const restarted = new SyncGroupLifecycleStore(createCapacitorSqliteDbPort(connection as never, 'ios'));
  expect(await restarted.loadJoinApplication('request-ios')).toMatchObject({ state: 'waiting' });
  await expect(restarted.applyManagerRoster(roster(2), 'member-provider'))
    .rejects.toThrow('manager_required');
  await expect(restarted.applyManagerRoster(roster(1), 'member-manager'))
    .rejects.toThrow('roster_revision_not_newer');

  const applied = await restarted.applyManagerRoster(roster(2), 'member-manager');
  expect(applied).toMatchObject({ roster_revision: 2, manager_member_id: 'member-manager' });
  expect(applied?.members.find((member) => member.member_id === 'member-ios'))
    .toMatchObject({ authorization_epoch: 2, state: 'active' });
});

it('keeps a grant pending across a native failure and completes it after restart', async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const statement of UNIFIED_SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
  seedMemberClient(sqlite);
  const port = createCapacitorSqliteDbPort(createFakeCapacitorConnection(sqlite) as never, 'ios');
  const draft = application();
  const intent: Omit<SyncGroupJoinApplication, 'application_public_key'> = draft;
  const failing = secureRoute(true);
  await persistPreparedJoinIntent(port, intent, failing);

  await expect(consumePreparedRouteGrant(
    port, grant(), roster(2), 'member-manager', NOW, failing
  )).rejects.toThrow('injected native grant failure');
  expect(sqlite.prepare("SELECT state FROM sync_group_route_grants WHERE grant_id = 'grant-ios'").pluck().get())
    .toBe('pending');

  const completed = await consumePreparedRouteGrant(
    port, grant(), roster(2), 'member-manager', NOW, secureRoute(false)
  );
  expect(completed.grant).toMatchObject({ grant_id: 'grant-ios', state: 'consumed' });
  expect(sqlite.prepare('SELECT local_member_id, installation_id, member_state FROM sync_group_local_state')
    .get()).toEqual({ installation_id: 'installation-ios', local_member_id: 'member-ios', member_state: 'active' });
  expect(sqlite.prepare("SELECT state FROM sync_group_join_applications WHERE request_id = 'request-ios'")
    .pluck().get()).toBe('approved');
});

const NOW = '2026-08-26T02:00:00.000Z';

function seedMemberClient(database: Database.Database) {
  database.prepare(`INSERT INTO sync_groups
    (group_id, timeline_id, display_name, manager_member_id, roster_revision, state, created_at, updated_at)
    VALUES ('group-a', 'timeline-a', 'Group A', 'member-manager', 1, 'active', ?, ?)`).run(NOW, NOW);
  database.prepare(`INSERT INTO sync_group_members
    (group_id, member_id, installation_id, display_name, host_platform, role, state, identity_state,
     authorization_id, authorization_epoch, joined_at, updated_at)
    VALUES ('group-a', 'member-ios', 'installation-ios', 'iPhone', 'ios', 'member', 'active',
      'verified', 'authorization-ios-1', 1, ?, ?)`).run(NOW, NOW);
  database.prepare(`INSERT INTO sync_group_member_authorizations
    (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
    VALUES ('group-a', 'member-ios', 'authorization-ios-1', 1, 'active', ?)`).run(NOW);
  database.prepare(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_member_id, installation_id, member_state, updated_at)
    VALUES (1, 'group-a', 'member-ios', 'installation-ios', 'active', ?)`).run(NOW);
}

function application(): SyncGroupJoinApplication {
  return { application_public_key: 'public-key', created_at: NOW, group_id: 'group-a',
    installation_id: 'installation-ios', library_facts: { library_id: 'isolated-ios' },
    previous_member_id: 'member-ios', protocol_version: 4, request_id: 'request-ios',
    requested_display_name: 'iPhone', requested_platform: 'ios', state: 'waiting',
    timeline_id: 'timeline-a', updated_at: NOW };
}

function roster(revision: number) {
  return { group_id: 'group-a', manager_member_id: 'member-manager', members: [
    { authorization_epoch: 1, authorization_id: 'authorization-manager', display_name: 'Manager',
      installation_id: 'installation-manager', member_id: 'member-manager', platform: 'darwin',
      role: 'manager' as const, state: 'active' as const },
    { authorization_epoch: 2, authorization_id: 'authorization-ios-2', display_name: 'iPhone',
      installation_id: 'installation-ios', member_id: 'member-ios', platform: 'ios',
      role: 'member' as const, state: 'active' as const }
  ], roster_revision: revision, state: 'active' as const, timeline_id: 'timeline-a' };
}

function grant() {
  return { authorization_epoch: 2, authorization_id: 'authorization-ios-2', created_at: NOW,
    encrypted_route_secret: { algorithm: 'fixture', ciphertext: 'secret' }, grant_id: 'grant-ios',
    group_id: 'group-a', local_member_id: 'member-ios', peer_member_id: 'member-manager',
    request_id: 'request-ios', roster_revision: 2, route_id: 'route-ios', state: 'pending' as const,
    timeline_id: 'timeline-a', updated_at: NOW };
}

function secureRoute(fail: boolean): SyncGroupLifecycleSecureRoutePort {
  return { consume: async () => {
    if (fail) throw new Error('injected native grant failure');
  }, create: async () => ({ public_key: 'durable-public-key' }), discard: async () => undefined };
}
