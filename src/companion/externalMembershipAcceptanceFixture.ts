import { computeSyncContentHash } from '../../lib/core/database/syncState';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { applySyncObjectInTransaction } from '../../lib/core/sync/syncObjectApplyExecutor';
import type { SyncGroupDevicePayload } from '../../lib/platform/syncGroupContract';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract';

export const externalAcceptanceGroup = 'external-acceptance';
export const externalAcceptanceBody = 'External acceptance original body';

export function externalAcceptanceDevice(index: number, now: string): SyncGroupDevicePayload {
  const anchor = `00000000-0000-4000-8000-00000000000${index}`;
  const identity = createSyncGroupDeviceIdentity({ device_anchor: anchor,
    group_id: externalAcceptanceGroup, library_path: `/acceptance/peer-${index}`, path_flavor: 'posix' });
  return { contract_version: 1, device_anchor: anchor, device_identity_key: identity.identity_key,
    canonical_library_path: `/acceptance/peer-${index}`, device_name: `Acceptance ${index}`,
    platform: 'android', state: 'active', joined_at: now, updated_at: now, left_at: null, last_seen_at: null };
}

export async function seedExternalMembershipAcceptance(db: DbPort, now: string) {
  const devices = [1, 2, 3].map(index => externalAcceptanceDevice(index, now));
  await db.run(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES (?, 'External acceptance', 'temporary', ?, ?)`, [externalAcceptanceGroup, now, now]);
  await db.run('INSERT INTO sync_group_local_state VALUES (1, ?, ?, ?, ?)',
    [externalAcceptanceGroup, devices[0]!.device_identity_key, 'active', now]);
  for (const device of devices) {
    await db.run(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor,
      canonical_library_path, device_name, platform, state, joined_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`, [externalAcceptanceGroup, device.device_identity_key,
      device.device_anchor, device.canonical_library_path, device.device_name, device.platform, now, now]);
  }
  await seedFolder(db, 'departing', devices[1]!.device_identity_key, now);
  await seedFolder(db, 'remaining', devices[2]!.device_identity_key, now);
  return devices;
}

async function seedFolder(db: DbPort, id: string, owner: string, now: string) {
  const payload = { id, source_ref: `external:${id}`, owner_device_identity_key: owner,
    host_name: 'Acceptance provider', host_platform: 'darwin', folder_path: `/fixture/${id}`,
    attachment_mode: 'document_relative', excluded_dirs_json: '[]' };
  await applySyncObjectInTransaction(db, { object_type: 'external_folder', object_id: id,
    payload_json: JSON.stringify(payload), content_hash: computeSyncContentHash('external_folder', payload),
    updated_at: now, deleted_at: null });
  await db.run(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name,
    extension, source_size_bytes, source_modified_at, source_modified_ms, content_hash, title,
    content, indexed_at, created_at, updated_at)
    VALUES (?, ?, 'note.md', 'note.md', 'md', 33, ?, 1, 'fixture', 'Note', ?, ?, ?, ?)`,
  [`${id}:note.md`, id, now, externalAcceptanceBody, now, now, now]);
}
