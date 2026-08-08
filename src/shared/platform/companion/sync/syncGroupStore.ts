import type { DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import {
  isEmptySyncGroupLibrary,
  type SyncGroupLibraryFacts,
  type SyncGroupPayload,
  type SyncGroupProvisioningPayload
} from '../../../../../lib/platform/syncGroupContract';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

function owner() {
  return getIosCompanionDatabaseOwner();
}

export function loadCompanionSyncGroup() {
  return owner().read(loadGroup);
}

export function loadCompanionSyncGroupLibraryFacts(): Promise<SyncGroupLibraryFacts> {
  return owner().read(async (db) => ({
    attachment_count: await count(db, 'attachments'),
    content_blob_count: await count(db, 'content_blobs'),
    node_count: await count(db, 'nodes'),
    review_log_count: await count(db, 'review_log'),
    timeline_id: await loadTimelineId(db)
  }));
}

export function beginCompanionSyncGroupProvisioning(args: {
  deviceId: string;
  emptyFacts: SyncGroupLibraryFacts;
  provisioning: SyncGroupProvisioningPayload;
}) {
  if (!isEmptySyncGroupLibrary(args.emptyFacts)) throw new Error('sync_group_requires_empty_library');
  return owner().runWriter((db) => db.transaction(async (tx) => {
    if (!isEmptySyncGroupLibrary(await loadFacts(tx))) throw new Error('sync_group_requires_empty_library');
    const group = args.provisioning.group;
    const now = new Date().toISOString();
    await tx.run(
      `INSERT INTO sync_groups VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
      [group.group_id, group.display_name, group.timeline_id, group.created_by_device_id, group.created_at, now]
    );
    for (const member of group.members) await saveMember(tx, group.group_id, member, now);
    await tx.run(
      `INSERT OR REPLACE INTO sync_group_local_state (
        singleton_id, group_id, local_device_id, member_state, provisioning_cursor,
        created_empty_proof_json, updated_at
      ) VALUES (1, ?, ?, 'provisioning', ?, ?, ?)`,
      [group.group_id, args.deviceId, args.provisioning.provisioning_cursor, JSON.stringify(args.emptyFacts), now]
    );
    return (await loadGroup(tx))!;
  }));
}

export function activateCompanionSyncGroup(group: SyncGroupPayload) {
  return owner().runWriter((db) => db.transaction(async (tx) => {
    const local = (await tx.query<DbRow>(
      'SELECT group_id, local_device_id FROM sync_group_local_state WHERE singleton_id = 1'
    ))[0];
    if (local?.group_id !== group.group_id || typeof local.local_device_id !== 'string') {
      throw new Error('sync_group_identity_mismatch');
    }
    const now = new Date().toISOString();
    for (const member of group.members) await saveMember(tx, group.group_id, member, now);
    await tx.run(
      `UPDATE sync_group_local_state SET member_state = 'active', provisioning_cursor = NULL,
       created_empty_proof_json = NULL, updated_at = ? WHERE singleton_id = 1`,
      [now]
    );
    return (await loadGroup(tx))!;
  }));
}

export function refreshActiveCompanionSyncGroupMembership(args: {
  deviceId: string;
  group: SyncGroupPayload;
}) {
  return owner().runWriter((db) => db.transaction(async (tx) => {
    const local = (await tx.query<DbRow>(
      `SELECT l.group_id, l.local_device_id, l.member_state, g.timeline_id
       FROM sync_group_local_state l JOIN sync_groups g ON g.group_id = l.group_id
       WHERE l.singleton_id = 1`
    ))[0];
    if (local?.group_id !== args.group.group_id
      || local.timeline_id !== args.group.timeline_id
      || local.local_device_id !== args.deviceId
      || local.member_state !== 'active') {
      throw new Error('sync_group_identity_mismatch');
    }
    const now = new Date().toISOString();
    await tx.run(
      'UPDATE sync_groups SET display_name = ?, updated_at = ? WHERE group_id = ?',
      [args.group.display_name, now, args.group.group_id]
    );
    for (const member of args.group.members) await saveMember(tx, args.group.group_id, member, now);
    await tx.run('UPDATE sync_group_local_state SET updated_at = ? WHERE singleton_id = 1', [now]);
    return (await loadGroup(tx))!;
  }));
}

export async function recoverInterruptedCompanionSyncGroupProvisioning() {
  const group = await loadCompanionSyncGroup();
  return group?.local_member_state === 'provisioning';
}

async function loadGroup(db: DbPort): Promise<SyncGroupPayload | null> {
  const row = (await db.query<DbRow>(
    `SELECT g.*, l.local_device_id, l.member_state AS local_member_state
     FROM sync_groups g JOIN sync_group_local_state l ON l.group_id = g.group_id
     WHERE l.singleton_id = 1 LIMIT 1`
  ))[0];
  if (!row || typeof row.group_id !== 'string') return null;
  const members = await db.query<DbRow>(
    `SELECT device_id, device_kind, device_name, state, approved_by_device_id,
            authorization_id, joined_at, activated_at
     FROM sync_group_members WHERE group_id = ? AND state != 'left' ORDER BY joined_at, device_id`,
    [row.group_id]
  );
  return {
    created_at: String(row.created_at), created_by_device_id: String(row.created_by_device_id),
    display_name: String(row.display_name), group_id: row.group_id,
    local_device_id: String(row.local_device_id),
    local_member_state: row.local_member_state === 'active' ? 'active' : 'provisioning',
    members: members.map((member) => ({
      activated_at: typeof member.activated_at === 'string' ? member.activated_at : null,
      approved_by_device_id: String(member.approved_by_device_id),
      authorization_id: String(member.authorization_id), device_id: String(member.device_id),
      device_kind: String(member.device_kind), device_name: String(member.device_name),
      joined_at: String(member.joined_at),
      state: member.state === 'active' ? 'active' : member.state === 'left' ? 'left' : 'provisioning'
    })),
    timeline_id: String(row.timeline_id)
  };
}

async function saveMember(db: DbPort, groupId: string, member: SyncGroupPayload['members'][number], now: string) {
  await db.run(
    `INSERT OR REPLACE INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
    [groupId, member.device_id, member.device_kind, member.device_name, member.state,
      member.approved_by_device_id, member.authorization_id, member.joined_at, member.activated_at, now]
  );
}

async function loadFacts(db: DbPort): Promise<SyncGroupLibraryFacts> {
  return {
    attachment_count: await count(db, 'attachments'), content_blob_count: await count(db, 'content_blobs'),
    node_count: await count(db, 'nodes'), review_log_count: await count(db, 'review_log'),
    timeline_id: await loadTimelineId(db)
  };
}

async function count(db: DbPort, table: string) {
  const row = (await db.query<DbRow>(`SELECT COUNT(*) AS value FROM ${table}`))[0];
  return Number(row?.value ?? 0);
}

async function loadTimelineId(db: DbPort) {
  const row = (await db.query<DbRow>('SELECT timeline_id FROM sync_groups LIMIT 1'))[0];
  return typeof row?.timeline_id === 'string' && row.timeline_id.trim() ? row.timeline_id : null;
}
