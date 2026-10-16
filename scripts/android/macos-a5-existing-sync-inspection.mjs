import { createHash } from 'node:crypto';
import { URL } from 'node:url';

const fingerprint = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

function authority(database) {
  const rows = database.prepare(`SELECT g.group_id, g.workgroup_key, l.local_device_identity_key
    FROM sync_group_local_state l JOIN sync_groups g ON g.group_id = l.group_id
    WHERE l.singleton_id = 1 AND l.state = 'active'`).all();
  if (rows.length !== 1 || !rows[0].workgroup_key) throw new Error('existing_sync_authority_missing');
  const current = rows[0];
  const members = database.prepare(`SELECT device_identity_key, platform, state
    FROM sync_group_devices WHERE group_id = ? ORDER BY device_identity_key`).all(current.group_id);
  return { ...current, members };
}

function requireMembers(phone, desktop) {
  const phoneId = phone.local_device_identity_key;
  const desktopId = desktop.local_device_identity_key;
  if (phoneId === desktopId) throw new Error('existing_sync_device_mismatch');
  for (const side of [phone, desktop]) {
    const mobile = side.members.find(row => row.device_identity_key === phoneId);
    const host = side.members.find(row => row.device_identity_key === desktopId);
    if (mobile?.state !== 'active' || !['android', 'android-capacitor'].includes(mobile.platform.toLowerCase())
      || host?.state !== 'active' || !['darwin', 'macos'].includes(host.platform.toLowerCase())) {
      throw new Error('existing_sync_device_mismatch');
    }
  }
  if (JSON.stringify(phone.members) !== JSON.stringify(desktop.members)) {
    throw new Error('existing_sync_membership_mismatch');
  }
}

export function inspectExistingSyncBaseline(phoneDb, desktopDb) {
  const phone = authority(phoneDb);
  const desktop = authority(desktopDb);
  if (phone.group_id !== desktop.group_id || phone.workgroup_key !== desktop.workgroup_key) {
    throw new Error('existing_sync_group_mismatch');
  }
  requireMembers(phone, desktop);
  const endpoint = phoneDb.prepare("SELECT value FROM companion_meta WHERE key = 'workspace_sync_endpoint_url'").get()?.value;
  if (!endpoint || !['http:', 'https:'].includes(new URL(endpoint).protocol)) {
    throw new Error('existing_sync_endpoint_missing');
  }
  const dirty = phoneDb.prepare(`SELECT object_type, object_id, content_hash FROM sync_object_state
    WHERE sync_dirty = 1 AND object_type <> 'view_state' ORDER BY object_type, object_id`).all();
  const lookup = desktopDb.prepare('SELECT content_hash FROM sync_object_state WHERE object_type = ? AND object_id = ?');
  const differences = dirty.flatMap(row => {
    const remote = lookup.get(row.object_type, row.object_id);
    return typeof row.content_hash === 'string' && row.content_hash.length > 0 && remote?.content_hash === row.content_hash ? [] : [{ ...row, desktop_content_hash: remote?.content_hash ?? null }];
  });
  return { syncGroupId: phone.group_id, syncGroupCredentialsPresent: true, syncGroupPeerConflict: false,
    activeSyncGroupMemberCount: phone.members.filter(row => row.state === 'active').length,
    syncGroupRemotePeerFingerprint: fingerprint(desktop.local_device_identity_key),
    localDeviceIdentityFingerprint: fingerprint(phone.local_device_identity_key),
    workspaceSyncEndpointPresent: true, dirtyRecordCount: dirty.length,
    matchedDirtyRecordCount: dirty.length - differences.length, differences,
    resultStatus: differences.length ? 'approval_required' : 'ready' };
}
