import type {
  SyncGroupDepartureKind,
  SyncGroupJoinApplication,
  SyncGroupLifecycleApprovalInput,
  SyncGroupRouteGrant
} from '../../platform/syncGroupLifecycleContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { SyncGroupLifecycleStore } from './syncGroupLifecycleStore.js';

export class SyncGroupLifecycleAuthority {
  constructor(private readonly db: DbPort) {}

  async receiveJoinApplication(actorMemberId: string, application: SyncGroupJoinApplication) {
    await requireManager(this.db, application.group_id, actorMemberId);
    return new SyncGroupLifecycleStore(this.db).saveJoinApplication({ ...application, state: 'pending' });
  }

  async rejectJoinApplication(actorMemberId: string, requestId: string, now: string) {
    await this.db.transaction(async (tx) => {
      const application = await requireApplication(tx, requestId);
      await requireManager(tx, application.group_id, actorMemberId);
      const result = await tx.run(`UPDATE sync_group_join_applications SET state = 'rejected', updated_at = ?
        WHERE request_id = ? AND state IN ('pending', 'waiting')`, [required(now), requestId]);
      if (result.changes !== 1) throw new Error('join_application_not_pending');
    });
    return new SyncGroupLifecycleStore(this.db).loadJoinApplication(requestId);
  }

  async approveJoinApplication(input: SyncGroupLifecycleApprovalInput) {
    const result = await this.db.transaction(async (tx) => {
      const application = await requireApplication(tx, input.request_id);
      const group = await requireManager(tx, application.group_id, input.actor_member_id);
      if (application.state !== 'pending' && application.state !== 'waiting') {
        throw new Error('join_application_not_pending');
      }
      const existing = (await tx.query<MemberRow>(`SELECT * FROM sync_group_members
        WHERE group_id = ? AND installation_id = ?`, [group.group_id, application.installation_id]))[0];
      const memberId = existing?.member_id ?? required(input.member_id);
      if (application.previous_member_id && existing && application.previous_member_id !== existing.member_id) {
        throw new Error('join_application_previous_member_mismatch');
      }
      const epoch = (existing?.authorization_epoch ?? 0) + 1;
      const revision = group.roster_revision + 1;
      await upsertMember(tx, application, memberId, epoch, input.authorization_id, input.now);
      await upsertAuthorization(tx, group.group_id, memberId, epoch, input.authorization_id, input.now);
      await tx.run('UPDATE sync_groups SET roster_revision = ?, updated_at = ? WHERE group_id = ?',
        [revision, input.now, group.group_id]);
      await tx.run(`UPDATE sync_group_join_applications SET state = 'approved', updated_at = ?
        WHERE request_id = ?`, [input.now, input.request_id]);
      const grant = grantFrom(input, application, group.manager_member_id, memberId, epoch, revision);
      await new SyncGroupLifecycleStore(tx).saveRouteGrant(grant);
      return { grant, groupId: group.group_id };
    });
    return { grant: result.grant, roster: await new SyncGroupLifecycleStore(this.db).loadRoster(result.groupId) };
  }

  async leaveMember(memberId: string, departureId: string, now: string) {
    return this.db.transaction(async (tx) => {
      const context = await memberContext(tx, memberId);
      if (context.member.role === 'manager') return retireManager(tx, context, departureId, now);
      await setMemberState(tx, context.group.group_id, memberId, 'left', now);
      await tx.run(`UPDATE sync_group_local_state SET member_state = 'left', updated_at = ?
        WHERE group_id = ? AND local_member_id = ?`, [now, context.group.group_id, memberId]);
      await insertDeparture(tx, context, departureId, 'leave', context.group.roster_revision, now);
      return { committed: true as const, roster_revision: context.group.roster_revision, state: 'left' as const };
    });
  }

  async revokeMember(actorMemberId: string, targetMemberId: string, departureId: string, now: string) {
    return this.db.transaction(async (tx) => {
      const target = await memberContext(tx, targetMemberId);
      const group = await requireManager(tx, target.group.group_id, actorMemberId);
      if (target.member.role === 'manager') throw new Error('manager_cannot_be_revoked');
      const revision = group.roster_revision + 1;
      await setMemberState(tx, group.group_id, targetMemberId, 'revoked', now);
      await tx.run(`UPDATE sync_group_route_grants SET state = 'revoked', updated_at = ?
        WHERE group_id = ? AND local_member_id = ?`, [now, group.group_id, targetMemberId]);
      await tx.run('UPDATE sync_groups SET roster_revision = ?, updated_at = ? WHERE group_id = ?',
        [revision, now, group.group_id]);
      await insertDeparture(tx, target, departureId, 'revoke', revision, now);
      return { committed: true as const, roster_revision: revision, state: 'revoked' as const };
    });
  }

  async markDepartureSent(departureId: string, now: string) {
    const result = await this.db.run(`UPDATE sync_group_departure_outbox
      SET state = 'sent', last_error = NULL, updated_at = ? WHERE departure_id = ? AND state = 'pending'`,
      [required(now), required(departureId)]);
    if (result.changes !== 1) throw new Error('departure_not_pending');
  }

  async recordDepartureFailure(departureId: string, errorCode: string, now: string) {
    const result = await this.db.run(`UPDATE sync_group_departure_outbox
      SET last_error = ?, updated_at = ? WHERE departure_id = ? AND state = 'pending'`,
      [required(errorCode), required(now), required(departureId)]);
    if (result.changes !== 1) throw new Error('departure_not_pending');
  }
}

interface GroupRow extends DbRow {
  group_id: string; manager_member_id: string; roster_revision: number; timeline_id: string;
}

interface MemberRow extends DbRow {
  authorization_epoch: number; group_id: string; member_id: string; role: 'manager' | 'member';
}

interface ApplicationRow extends DbRow {
  group_id: string; installation_id: string; previous_member_id: string | null;
  request_id: string; requested_display_name: string; requested_platform: string;
  state: SyncGroupJoinApplication['state']; timeline_id: string;
}

interface MemberContext { group: GroupRow; member: MemberRow }

async function requireManager(db: DbPort, groupId: string, actorMemberId: string) {
  const rows = await db.query<GroupRow & { actor_role: string; actor_state: string }>(`SELECT g.*,
    m.role AS actor_role, m.state AS actor_state FROM sync_groups g
    LEFT JOIN sync_group_members m ON m.group_id = g.group_id AND m.member_id = ?
    WHERE g.group_id = ?`, [required(actorMemberId), required(groupId)]);
  const row = rows[0];
  if (!row || row.manager_member_id !== actorMemberId || row.actor_role !== 'manager' || row.actor_state !== 'active') {
    throw new Error('manager_required');
  }
  return row;
}

async function requireApplication(db: DbPort, requestId: string) {
  const rows = await db.query<ApplicationRow>(
    'SELECT * FROM sync_group_join_applications WHERE request_id = ?', [required(requestId)]);
  if (!rows[0]) throw new Error('join_application_not_found');
  return rows[0];
}

async function memberContext(db: DbPort, memberId: string): Promise<MemberContext> {
  const members = await db.query<MemberRow>('SELECT * FROM sync_group_members WHERE member_id = ?', [required(memberId)]);
  const member = members[0];
  if (!member) throw new Error('sync_group_member_not_found');
  const groups = await db.query<GroupRow>('SELECT * FROM sync_groups WHERE group_id = ?', [member.group_id]);
  if (!groups[0]) throw new Error('sync_group_not_found');
  return { group: groups[0], member };
}

async function upsertMember(
  db: DbPort, application: ApplicationRow, memberId: string, epoch: number,
  authorizationId: string, now: string
) {
  await db.run(`INSERT INTO sync_group_members
    (group_id, member_id, installation_id, display_name, host_platform, role, state, identity_state,
     authorization_id, authorization_epoch, joined_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'member', 'active', 'verified', ?, ?, ?, ?)
    ON CONFLICT(group_id, member_id) DO UPDATE SET state = 'active', authorization_id = excluded.authorization_id,
      authorization_epoch = excluded.authorization_epoch, updated_at = excluded.updated_at`, [
    application.group_id, memberId, application.installation_id, application.requested_display_name,
    application.requested_platform, required(authorizationId), epoch, now, now
  ]);
}

async function upsertAuthorization(
  db: DbPort, groupId: string, memberId: string, epoch: number, authorizationId: string, now: string
) {
  await db.run(`INSERT INTO sync_group_member_authorizations
    (group_id, member_id, authorization_id, authorization_epoch, state, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?)
    ON CONFLICT(group_id, member_id) DO UPDATE SET authorization_id = excluded.authorization_id,
      authorization_epoch = excluded.authorization_epoch, state = 'active', updated_at = excluded.updated_at`,
  [groupId, memberId, authorizationId, epoch, now]);
}

async function setMemberState(db: DbPort, groupId: string, memberId: string, state: 'left' | 'revoked', now: string) {
  const member = await db.run('UPDATE sync_group_members SET state = ?, updated_at = ? WHERE group_id = ? AND member_id = ?',
    [state, now, groupId, memberId]);
  const authorization = await db.run(`UPDATE sync_group_member_authorizations SET state = ?, updated_at = ?
    WHERE group_id = ? AND member_id = ?`, [state, now, groupId, memberId]);
  if (member.changes !== 1 || authorization.changes !== 1) throw new Error('member_state_not_persisted');
}

async function retireManager(db: DbPort, context: MemberContext, departureId: string, now: string) {
  const active = await db.query(`SELECT member_id FROM sync_group_members
    WHERE group_id = ? AND member_id <> ? AND state = 'active' LIMIT 1`,
  [context.group.group_id, context.member.member_id]);
  if (active.length) throw new Error('manager_has_active_members');
  const revision = context.group.roster_revision + 1;
  await setMemberState(db, context.group.group_id, context.member.member_id, 'left', now);
  await db.run(`UPDATE sync_group_local_state SET member_state = 'left', updated_at = ?
    WHERE group_id = ? AND local_member_id = ?`, [now, context.group.group_id, context.member.member_id]);
  await db.run(`UPDATE sync_groups SET state = 'retired', roster_revision = ?, updated_at = ? WHERE group_id = ?`,
    [revision, now, context.group.group_id]);
  await insertDeparture(db, context, departureId, 'retire', revision, now);
  return { committed: true as const, roster_revision: revision, state: 'retired' as const };
}

async function insertDeparture(
  db: DbPort, context: MemberContext, departureId: string,
  kind: SyncGroupDepartureKind, revision: number, now: string
) {
  await db.run(`INSERT INTO sync_group_departure_outbox
    (departure_id, group_id, timeline_id, member_id, kind, roster_revision, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`, [required(departureId), context.group.group_id,
    context.group.timeline_id, context.member.member_id, kind, revision, now, now]);
}

function grantFrom(
  input: SyncGroupLifecycleApprovalInput, application: ApplicationRow,
  managerMemberId: string, memberId: string, epoch: number, revision: number
): SyncGroupRouteGrant {
  return { authorization_epoch: epoch, authorization_id: required(input.authorization_id),
    created_at: input.now, encrypted_route_secret: input.encrypted_route_secret,
    grant_id: required(input.grant_id), group_id: application.group_id, local_member_id: memberId,
    peer_member_id: managerMemberId, request_id: application.request_id, roster_revision: revision,
    route_id: required(input.route_id), state: 'pending', timeline_id: application.timeline_id,
    updated_at: input.now };
}

function required(value: string) {
  const result = value.trim();
  if (!result) throw new Error('sync_group_lifecycle_value_required');
  return result;
}
