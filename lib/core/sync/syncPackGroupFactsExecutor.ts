import type { DbPort, DbRow } from './dbPort.js';

interface GroupRow extends DbRow {
  created_at: string;
  created_by_device_id: string;
  display_name: string;
  group_id: string;
  timeline_id: string;
}

interface MemberRow extends DbRow {
  approved_by_device_id: string;
  authorization_id: string;
  device_id: string;
  device_kind: string;
  device_name: string;
  group_id: string;
  joined_at: string;
  state: string;
}

interface DepartureRow extends DbRow {
  authorization_id: string;
  authorized_by_device_id: string;
  device_id: string;
  group_id: string;
  left_at: string;
}

export async function applySyncPackGroupFactsWithDbPort(port: DbPort, args: {
  incomingAlias?: string;
  sourcePeerId: string;
}) {
  const alias = identifier(args.incomingAlias ?? 'inc');
  const incomingGroups = await port.query<GroupRow>(`SELECT * FROM ${alias}.sync_groups`);
  if (incomingGroups.length === 0) return { appliedMemberCount: 0 };
  if (incomingGroups.length !== 1) throw new Error('sync_group_pack_identity_invalid');
  const incomingGroup = incomingGroups[0]!;
  const local = (await port.query<GroupRow & { local_device_id: string }>(
    `SELECT g.group_id, g.display_name, g.timeline_id, g.created_by_device_id, g.created_at,
            l.local_device_id
     FROM main.sync_groups g JOIN main.sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 LIMIT 1`
  ))[0];
  assertSameGroup(local, incomingGroup);
  const source = (await port.query<MemberRow>(
    `SELECT * FROM main.sync_group_members
     WHERE group_id = ? AND device_id = ? AND state = 'active' LIMIT 1`,
    [local.group_id, args.sourcePeerId]
  ))[0];
  if (!source) throw new Error('sync_group_source_not_authorized');
  const members = await port.query<MemberRow>(`SELECT * FROM ${alias}.sync_group_members`);
  const departures = await port.query<DepartureRow>(`SELECT * FROM ${alias}.sync_group_member_departures`);
  validateFacts(incomingGroup, members, departures);
  if (departures.some((item) => item.device_id === local.local_device_id)) {
    throw new Error('sync_group_local_departure_requires_local_action');
  }
  const now = new Date().toISOString();
  for (const member of members) await mergeMember(port, incomingGroup.group_id, member, now);
  for (const departure of departures) await mergeDeparture(port, departure, now);
  return { appliedMemberCount: members.length };
}

function assertSameGroup(local: GroupRow | undefined, incoming: GroupRow): asserts local is GroupRow {
  if (!local || ['group_id', 'timeline_id', 'created_by_device_id', 'created_at', 'display_name']
    .some((key) => local[key] !== incoming[key])) {
    throw new Error('sync_group_identity_mismatch');
  }
}

function validateFacts(group: GroupRow, members: MemberRow[], departures: DepartureRow[]) {
  if (members.some((member) => member.group_id !== group.group_id || !['active', 'left'].includes(member.state))) {
    throw new Error('sync_group_member_fact_invalid');
  }
  const byDevice = new Map(members.map((member) => [member.device_id, member]));
  const founder = byDevice.get(group.created_by_device_id);
  if (!founder || founder.approved_by_device_id !== founder.device_id) {
    throw new Error('sync_group_founder_authorization_invalid');
  }
  const resolved = new Set([founder.device_id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const member of members) {
      if (resolved.has(member.device_id) || !resolved.has(member.approved_by_device_id)) continue;
      const approver = byDevice.get(member.approved_by_device_id)!;
      const departure = departures.find((item) => item.device_id === approver.device_id);
      if (approver.joined_at <= member.joined_at && (!departure || departure.left_at >= member.joined_at)) {
        resolved.add(member.device_id); changed = true;
      }
    }
  }
  if (resolved.size !== members.length) throw new Error('sync_group_member_authorization_invalid');
  for (const departure of departures) {
    const member = byDevice.get(departure.device_id);
    if (!member || departure.group_id !== group.group_id || departure.authorized_by_device_id !== departure.device_id
      || departure.left_at < member.joined_at || member.state !== 'left') {
      throw new Error('sync_group_departure_authorization_invalid');
    }
  }
  if (members.some((member) => member.state === 'left' && !departures.some((item) => item.device_id === member.device_id))) {
    throw new Error('sync_group_departure_fact_missing');
  }
}

async function mergeMember(port: DbPort, groupId: string, member: MemberRow, now: string) {
  await port.run(
    `INSERT INTO main.sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
    ON CONFLICT(group_id, device_id) DO UPDATE SET
      device_kind = CASE WHEN excluded.authorization_id < authorization_id THEN excluded.device_kind ELSE device_kind END,
      device_name = CASE WHEN excluded.authorization_id < authorization_id THEN excluded.device_name ELSE device_name END,
      approved_by_device_id = CASE WHEN excluded.authorization_id < authorization_id THEN excluded.approved_by_device_id ELSE approved_by_device_id END,
      authorization_id = MIN(authorization_id, excluded.authorization_id),
      joined_at = CASE WHEN excluded.authorization_id < authorization_id THEN excluded.joined_at ELSE joined_at END,
      updated_at = MAX(updated_at, excluded.updated_at)`,
    [groupId, member.device_id, member.device_kind, member.device_name, member.approved_by_device_id,
      member.authorization_id, member.joined_at, now]
  );
}

async function mergeDeparture(port: DbPort, departure: DepartureRow, now: string) {
  await port.run(
    `INSERT INTO main.sync_group_member_departures
      (group_id, device_id, authorized_by_device_id, authorization_id, left_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(group_id, device_id) DO UPDATE SET
       authorization_id = MIN(authorization_id, excluded.authorization_id),
       left_at = MIN(left_at, excluded.left_at)`,
    [departure.group_id, departure.device_id, departure.authorized_by_device_id,
      departure.authorization_id, departure.left_at]
  );
  await port.run(
    `UPDATE main.sync_group_members SET state = 'left', left_at = ?, updated_at = ?
     WHERE group_id = ? AND device_id = ? AND state <> 'left'`,
    [departure.left_at, now, departure.group_id, departure.device_id]
  );
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
