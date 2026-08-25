import type {
  SyncGroupJoinApplication,
  SyncGroupRosterMember,
  SyncGroupRosterSnapshot,
  SyncGroupRouteGrant
} from '../../platform/syncGroupLifecycleContract.js';
import { parseSyncGroupJoinApplication, parseSyncGroupRosterSnapshot, parseSyncGroupRouteGrant } from
  '../../platform/syncGroupLifecycleContract.js';

import type { DbPort, DbRow } from './dbPort.js';

export class SyncGroupLifecycleStore {
  constructor(private readonly db: DbPort) {}

  async saveJoinApplication(application: SyncGroupJoinApplication) {
    const value = parseSyncGroupJoinApplication(application);
    await this.db.run(`INSERT INTO sync_group_join_applications
      (request_id, group_id, timeline_id, installation_id, requested_display_name,
       requested_platform, previous_member_id, application_public_key, library_facts_json,
       protocol_version, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        state = CASE WHEN sync_group_join_applications.state IN ('approved', 'rejected')
          THEN sync_group_join_applications.state ELSE excluded.state END,
        updated_at = excluded.updated_at`, applicationParams(value));
    return this.loadJoinApplication(value.request_id);
  }

  async loadJoinApplication(requestId: string) {
    const rows = await this.db.query<JoinApplicationRow>(
      'SELECT * FROM sync_group_join_applications WHERE request_id = ?', [required(requestId)]);
    return rows[0] ? joinApplication(rows[0]) : null;
  }

  async listJoinApplications(groupId: string, state?: SyncGroupJoinApplication['state']) {
    const rows = state
      ? await this.db.query<JoinApplicationRow>(
        'SELECT * FROM sync_group_join_applications WHERE group_id = ? AND state = ? ORDER BY created_at',
        [required(groupId), state])
      : await this.db.query<JoinApplicationRow>(
        'SELECT * FROM sync_group_join_applications WHERE group_id = ? ORDER BY created_at',
        [required(groupId)]);
    return rows.map(joinApplication);
  }

  async loadRoster(groupId: string): Promise<SyncGroupRosterSnapshot | null> {
    const groups = await this.db.query<GroupRow>('SELECT * FROM sync_groups WHERE group_id = ?', [required(groupId)]);
    const group = groups[0];
    if (!group) return null;
    const members = await this.db.query<MemberRow>(
      'SELECT * FROM sync_group_members WHERE group_id = ? ORDER BY member_id', [groupId]);
    return roster(group, members);
  }

  async applyManagerRoster(snapshot: SyncGroupRosterSnapshot, verifiedManagerMemberId: string) {
    const value = parseSyncGroupRosterSnapshot(snapshot);
    if (value.manager_member_id !== required(verifiedManagerMemberId)) throw new Error('manager_required');
    await this.db.transaction(async (tx) => {
      const current = await tx.query<GroupRow>('SELECT * FROM sync_groups WHERE group_id = ?', [value.group_id]);
      const group = current[0];
      if (!group || group.timeline_id !== value.timeline_id ||
          group.manager_member_id !== value.manager_member_id) throw new Error('sync_group_identity_mismatch');
      if (value.roster_revision < group.roster_revision) throw new Error('roster_revision_not_newer');
      if (value.roster_revision === group.roster_revision) {
        const members = await tx.query<MemberRow>(
          'SELECT * FROM sync_group_members WHERE group_id = ? ORDER BY member_id', [value.group_id]);
        if (sameRoster(value, roster(group, members))) return;
        throw new Error('roster_revision_not_newer');
      }
      await tx.run('UPDATE sync_groups SET roster_revision = ?, state = ?, updated_at = ? WHERE group_id = ?',
        [value.roster_revision, value.state, nowFromRoster(value), value.group_id]);
      for (const member of value.members) await upsertRosterMember(tx, value.group_id, member);
    });
    return this.loadRoster(value.group_id);
  }

  async saveRouteGrant(grant: SyncGroupRouteGrant) {
    const value = parseSyncGroupRouteGrant(grant);
    await this.db.run(`INSERT INTO sync_group_route_grants
      (grant_id, request_id, group_id, timeline_id, local_member_id, peer_member_id,
       authorization_id, authorization_epoch, route_id, encrypted_route_secret_json,
       roster_revision, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grant_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`, [
      value.grant_id, value.request_id, value.group_id, value.timeline_id, value.local_member_id,
      value.peer_member_id, value.authorization_id, value.authorization_epoch, value.route_id,
      JSON.stringify(value.encrypted_route_secret), value.roster_revision, value.state,
      value.created_at, value.updated_at
    ]);
    return this.loadRouteGrant(value.grant_id);
  }

  async loadRouteGrant(grantId: string) {
    const rows = await this.db.query<RouteGrantRow>(
      'SELECT * FROM sync_group_route_grants WHERE grant_id = ?', [required(grantId)]);
    return rows[0] ? routeGrant(rows[0]) : null;
  }

  async loadRouteGrantForRequest(requestId: string) {
    const rows = await this.db.query<RouteGrantRow>(
      'SELECT * FROM sync_group_route_grants WHERE request_id = ?', [required(requestId)]);
    return rows[0] ? routeGrant(rows[0]) : null;
  }

  async markRouteGrantConsumed(grantId: string, installationId: string, now: string) {
    await this.db.transaction(async (tx) => {
      const grants = await tx.query<RouteGrantRow>(
        'SELECT * FROM sync_group_route_grants WHERE grant_id = ?', [required(grantId)]);
      const grant = grants[0];
      if (!grant) throw new Error('route_grant_not_found');
      const members = await tx.query<MemberRow>(`SELECT * FROM sync_group_members
        WHERE group_id = ? AND member_id = ? AND installation_id = ? AND state = 'active'`,
      [grant.group_id, grant.local_member_id, required(installationId)]);
      if (!members[0]) throw new Error('route_grant_local_member_mismatch');
      if (grant.state === 'consumed') return;
      if (grant.state !== 'pending') throw new Error('route_grant_not_pending');
      const result = await tx.run(`UPDATE sync_group_route_grants SET state = 'consumed', updated_at = ?
        WHERE grant_id = ? AND state = 'pending'`, [required(now), grantId]);
      if (result.changes !== 1) throw new Error('route_grant_not_pending');
      await tx.run(`UPDATE sync_group_join_applications SET state = 'approved', updated_at = ?
        WHERE request_id = ?`, [now, grant.request_id]);
      await tx.run(`INSERT INTO sync_group_local_state
        (singleton_id, group_id, local_member_id, installation_id, member_state, updated_at)
        VALUES (1, ?, ?, ?, 'active', ?)
        ON CONFLICT(singleton_id) DO UPDATE SET group_id = excluded.group_id,
          local_member_id = excluded.local_member_id, installation_id = excluded.installation_id,
          member_state = excluded.member_state, updated_at = excluded.updated_at`,
      [grant.group_id, grant.local_member_id, installationId, now]);
    });
    return this.loadRouteGrant(grantId);
  }
}

interface JoinApplicationRow extends DbRow {
  application_public_key: string; created_at: string; group_id: string; installation_id: string;
  library_facts_json: string; previous_member_id: string | null; protocol_version: number;
  request_id: string; requested_display_name: string; requested_platform: string;
  state: SyncGroupJoinApplication['state']; timeline_id: string; updated_at: string;
}

interface GroupRow extends DbRow {
  group_id: string; manager_member_id: string; roster_revision: number;
  state: 'active' | 'retired'; timeline_id: string; updated_at: string;
}

interface MemberRow extends DbRow {
  authorization_epoch: number; authorization_id: string; display_name: string;
  host_platform: string; installation_id: string; member_id: string;
  role: SyncGroupRosterMember['role']; state: SyncGroupRosterMember['state'];
}

interface RouteGrantRow extends DbRow {
  authorization_epoch: number; authorization_id: string; created_at: string;
  encrypted_route_secret_json: string; grant_id: string; group_id: string;
  local_member_id: string; peer_member_id: string; request_id: string; roster_revision: number;
  route_id: string; state: SyncGroupRouteGrant['state']; timeline_id: string; updated_at: string;
}

function applicationParams(value: SyncGroupJoinApplication) {
  return [value.request_id, value.group_id, value.timeline_id, value.installation_id,
    value.requested_display_name, value.requested_platform, value.previous_member_id,
    value.application_public_key, JSON.stringify(value.library_facts), value.protocol_version,
    value.state, value.created_at, value.updated_at] as const;
}

function joinApplication(row: JoinApplicationRow) {
  return parseSyncGroupJoinApplication({ ...row, library_facts: JSON.parse(row.library_facts_json) });
}

function routeGrant(row: RouteGrantRow) {
  return parseSyncGroupRouteGrant({
    ...row, encrypted_route_secret: JSON.parse(row.encrypted_route_secret_json)
  });
}

function roster(group: GroupRow, members: MemberRow[]): SyncGroupRosterSnapshot {
  return { group_id: group.group_id, manager_member_id: group.manager_member_id,
    members: members.map((member) => ({ authorization_epoch: member.authorization_epoch,
      authorization_id: member.authorization_id, display_name: member.display_name,
      installation_id: member.installation_id, member_id: member.member_id,
      platform: member.host_platform, role: member.role, state: member.state })),
    roster_revision: group.roster_revision, state: group.state,
    timeline_id: group.timeline_id };
}

function sameRoster(left: SyncGroupRosterSnapshot, right: SyncGroupRosterSnapshot) {
  const normalize = (snapshot: SyncGroupRosterSnapshot) => JSON.stringify({
    ...snapshot, members: [...snapshot.members].sort((a, b) => a.member_id.localeCompare(b.member_id))
  });
  return normalize(left) === normalize(right);
}

async function upsertRosterMember(db: DbPort, groupId: string, member: SyncGroupRosterMember) {
  const updatedAt = `roster-member:${member.authorization_epoch}`;
  await db.run(`INSERT INTO sync_group_members
    (group_id, member_id, installation_id, display_name, host_platform, role, state, identity_state,
     authorization_id, authorization_epoch, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?)
    ON CONFLICT(group_id, member_id) DO UPDATE SET installation_id = excluded.installation_id,
      display_name = excluded.display_name, host_platform = excluded.host_platform,
      role = excluded.role, state = excluded.state, authorization_id = excluded.authorization_id,
      authorization_epoch = excluded.authorization_epoch, updated_at = excluded.updated_at`, [
    groupId, member.member_id, member.installation_id, member.display_name, member.platform,
    member.role, member.state, member.authorization_id, member.authorization_epoch,
    updatedAt, updatedAt
  ]);
  await db.run(`INSERT INTO sync_group_member_authorizations
    (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, member_id) DO UPDATE SET authorization_id = excluded.authorization_id,
      authorization_epoch = excluded.authorization_epoch, state = excluded.state,
      updated_at = excluded.updated_at`, [groupId, member.member_id, member.authorization_id,
    member.authorization_epoch, member.state, updatedAt]);
}

function nowFromRoster(snapshot: SyncGroupRosterSnapshot) {
  return `roster-revision:${snapshot.roster_revision}`;
}

function required(value: string) {
  const result = value.trim();
  if (!result) throw new Error('sync_group_lifecycle_value_required');
  return result;
}
