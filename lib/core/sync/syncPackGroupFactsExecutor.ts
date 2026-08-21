import type { DbPort, DbRow } from './dbPort.js';

interface GroupRow extends DbRow {
  created_at: string;
  created_by_host_name: string;
  display_name: string;
  group_id: string;
  timeline_id: string;
}

interface MemberRow extends DbRow {
  approved_by_host_name: string;
  authorization_id: string;
  host_name: string;
  host_platform: string;
  group_id: string;
  joined_at: string;
  state: string;
  updated_at: string;
}

interface DepartureRow extends DbRow {
  authorization_id: string;
  authorized_by_host_name: string;
  host_name: string;
  group_id: string;
  left_at: string;
}

export async function applySyncPackGroupFactsWithDbPort(port: DbPort, args: {
  incomingAlias?: string;
  sourceHostName: string;
}) {
  const alias = identifier(args.incomingAlias ?? 'inc');
  const incomingGroups = await port.query<GroupRow>(`SELECT * FROM ${alias}.sync_groups`);
  if (incomingGroups.length === 0) return { appliedMemberCount: 0 };
  if (incomingGroups.length !== 1) throw new Error('sync_group_pack_identity_invalid');
  const incomingGroup = incomingGroups[0]!;
  const local = (await port.query<GroupRow & { local_host_name: string }>(
    `SELECT g.group_id, g.display_name, g.timeline_id, g.created_by_host_name, g.created_at,
            l.local_host_name
     FROM main.sync_groups g JOIN main.sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 LIMIT 1`
  ))[0];
  assertSameGroup(local, incomingGroup);
  const source = (await port.query<MemberRow>(
    `SELECT * FROM main.sync_group_members
     WHERE group_id = ? AND host_name = ? AND state = 'active' LIMIT 1`,
    [local.group_id, args.sourceHostName]
  ))[0];
  if (!source) throw new Error('sync_group_source_not_authorized');
  const members = await port.query<MemberRow>(`SELECT * FROM ${alias}.sync_group_members`);
  const departures = await port.query<DepartureRow>(`SELECT * FROM ${alias}.sync_group_member_departures`);
  validateFacts(incomingGroup, members, departures);
  const localMember = (await port.query<MemberRow>(
    `SELECT * FROM main.sync_group_members WHERE group_id = ? AND host_name = ? LIMIT 1`,
    [local.group_id, local.local_host_name]
  ))[0];
  if (departures.some((item) => item.host_name === local.local_host_name
    && (!localMember || item.left_at >= localMember.joined_at))) {
    throw new Error('sync_group_local_departure_requires_local_action');
  }
  const now = new Date().toISOString();
  for (const member of members) {
    await mergeMember(port, incomingGroup.group_id, member);
  }
  await port.run(`UPDATE main.sync_groups SET created_by_host_name = ?, updated_at = ?
    WHERE group_id = ?`, [incomingGroup.created_by_host_name, now, incomingGroup.group_id]);
  for (const departure of departures) await mergeDeparture(port, departure, now);
  return { appliedMemberCount: members.length };
}

function assertSameGroup(local: GroupRow | undefined, incoming: GroupRow): asserts local is GroupRow {
  if (!local || ['group_id', 'timeline_id', 'created_at', 'display_name']
    .some((key) => local[key] !== incoming[key])) {
    throw new Error('sync_group_identity_mismatch');
  }
}

function validateFacts(group: GroupRow, members: MemberRow[], departures: DepartureRow[]) {
  if (members.some((member) => member.group_id !== group.group_id || !['active', 'left'].includes(member.state))) {
    throw new Error('sync_group_member_fact_invalid');
  }
  const byHost = new Map(members.map((member) => [member.host_name, member]));
  const byAuthorization = new Map(members.map((member) => [member.authorization_id, member]));
  const effectiveDepartures = departures.filter((departure) => {
    const member = byHost.get(departure.host_name) ?? byAuthorization.get(departure.authorization_id);
    return member && departure.left_at >= member.joined_at;
  });
  const departureByHost = new Map(effectiveDepartures.map((item) => [item.host_name, item]));
  const founder = byHost.get(group.created_by_host_name);
  if (!founder || founder.approved_by_host_name !== founder.host_name) {
    throw new Error('sync_group_founder_authorization_invalid');
  }
  const resolved = new Set([founder.host_name]);
  for (let changed = true; changed;) {
    changed = false;
    for (const member of members) {
      if (resolved.has(member.host_name) || !resolved.has(member.approved_by_host_name)) continue;
      const approver = byHost.get(member.approved_by_host_name)!;
      const departure = departureByHost.get(approver.host_name);
      if (approver.joined_at <= member.joined_at && (!departure || departure.left_at >= member.joined_at)) {
        resolved.add(member.host_name); changed = true;
      }
    }
  }
  if (resolved.size !== members.length) throw new Error('sync_group_member_authorization_invalid');
  for (const departure of departures) {
    const member = byHost.get(departure.host_name) ?? byAuthorization.get(departure.authorization_id);
    if (member && departure.left_at < member.joined_at) continue;
    const authorizer = byHost.get(departure.authorized_by_host_name);
    const authorizerDeparture = departureByHost.get(departure.authorized_by_host_name);
    if (!member || !authorizer || departure.group_id !== group.group_id
      || authorizer.joined_at > departure.left_at
      || (authorizerDeparture && authorizerDeparture.left_at < departure.left_at)
      || (departure.host_name === member.host_name
        && departure.left_at >= member.joined_at && member.state !== 'left')) {
      throw new Error('sync_group_departure_authorization_invalid');
    }
  }
  if (members.some((member) => member.state === 'left' && !departureByHost.has(member.host_name))) {
    throw new Error('sync_group_departure_fact_missing');
  }
}

async function mergeMember(
  port: DbPort,
  groupId: string,
  member: MemberRow
) {
  if (await mergeAuthorizedHostRename(port, groupId, member)) return;
  await port.run(
    `INSERT INTO main.sync_group_members (
      group_id, host_name, host_platform, state, approved_by_host_name,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL, ?)
    ON CONFLICT(group_id, host_name) DO UPDATE SET
      host_platform = CASE WHEN excluded.joined_at > joined_at OR
        (excluded.joined_at = joined_at AND excluded.authorization_id < authorization_id)
        THEN excluded.host_platform ELSE host_platform END,
      state = CASE WHEN excluded.joined_at > joined_at THEN 'active' ELSE state END,
      approved_by_host_name = CASE WHEN excluded.joined_at > joined_at OR
        (excluded.joined_at = joined_at AND excluded.authorization_id < authorization_id)
        THEN excluded.approved_by_host_name ELSE approved_by_host_name END,
      authorization_id = CASE WHEN excluded.joined_at > joined_at THEN excluded.authorization_id
        WHEN excluded.joined_at = joined_at THEN MIN(authorization_id, excluded.authorization_id)
        ELSE authorization_id END,
      joined_at = MAX(joined_at, excluded.joined_at),
      left_at = CASE WHEN excluded.joined_at > joined_at THEN NULL ELSE left_at END,
      updated_at = MAX(updated_at, excluded.updated_at)`,
    [groupId, member.host_name, member.host_platform, member.approved_by_host_name,
      member.authorization_id, member.joined_at, member.updated_at]
  );
  await port.run(
    `DELETE FROM main.sync_group_member_departures
     WHERE group_id = ? AND host_name = ? AND left_at < (
       SELECT joined_at FROM main.sync_group_members WHERE group_id = ? AND host_name = ?
     )`,
    [groupId, member.host_name, groupId, member.host_name]
  );
}

async function mergeAuthorizedHostRename(port: DbPort, groupId: string, member: MemberRow) {
  const [existing] = await port.query<MemberRow>(`SELECT * FROM main.sync_group_members
    WHERE group_id = ? AND authorization_id = ? LIMIT 1`, [groupId, member.authorization_id]);
  if (!existing || existing.host_name === member.host_name) return false;
  if (existing.updated_at >= member.updated_at) return true;
  const [occupied] = await port.query<MemberRow>(`SELECT * FROM main.sync_group_members
    WHERE group_id = ? AND host_name = ? AND authorization_id <> ? LIMIT 1`,
  [groupId, member.host_name, member.authorization_id]);
  if (occupied?.state === 'active') throw new Error('sync_group_host_name_conflict');
  if (occupied) {
    if (occupied.updated_at >= member.updated_at) throw new Error('sync_group_host_name_conflict');
    await port.run(`DELETE FROM main.sync_group_member_departures
      WHERE group_id = ? AND (host_name = ? OR authorization_id = ?)`,
    [groupId, occupied.host_name, occupied.authorization_id]);
    await port.run(`DELETE FROM main.sync_group_members
      WHERE group_id = ? AND authorization_id = ? AND state = 'left'`,
    [groupId, occupied.authorization_id]);
  }
  await port.run(`UPDATE main.sync_group_members SET approved_by_host_name = ?
    WHERE group_id = ? AND approved_by_host_name = ?`, [member.host_name, groupId, existing.host_name]);
  await port.run(`UPDATE main.sync_group_local_state SET local_host_name = ?
    WHERE group_id = ? AND local_host_name = ?`, [member.host_name, groupId, existing.host_name]);
  await port.run(`UPDATE main.sync_group_members SET host_name = ?, host_platform = ?,
      approved_by_host_name = ?, state = 'active', left_at = NULL, updated_at = ?
    WHERE group_id = ? AND authorization_id = ?`,
  [member.host_name, member.host_platform, member.approved_by_host_name, member.updated_at,
    groupId, member.authorization_id]);
  return true;
}

async function mergeDeparture(port: DbPort, departure: DepartureRow, now: string) {
  await port.run(
    `INSERT INTO main.sync_group_member_departures
      (group_id, host_name, authorized_by_host_name, authorization_id, left_at)
     SELECT ?, ?, ?, ?, ? WHERE EXISTS (
       SELECT 1 FROM main.sync_group_members WHERE group_id = ?
         AND (host_name = ? OR authorization_id = ?) AND joined_at <= ?
     )
     ON CONFLICT(group_id, host_name) DO UPDATE SET
       authorized_by_host_name = excluded.authorized_by_host_name,
       authorization_id = excluded.authorization_id,
       left_at = excluded.left_at
     WHERE excluded.left_at > left_at`,
    [departure.group_id, departure.host_name, departure.authorized_by_host_name,
      departure.authorization_id, departure.left_at, departure.group_id, departure.host_name,
      departure.authorization_id, departure.left_at]
  );
  await port.run(
    `UPDATE main.sync_group_members SET state = 'left', left_at = ?, updated_at = ?
     WHERE group_id = ? AND host_name = ? AND state <> 'left' AND joined_at <= ?`,
    [departure.left_at, now, departure.group_id, departure.host_name, departure.left_at]
  );
}

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
