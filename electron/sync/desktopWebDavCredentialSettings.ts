import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { decryptDesktopWebDavCredentialDraft, readDesktopWebDavCredentialCiphertext } from '../security/desktopWebDavCredentialStore.js';

export function requireActiveGroupKey(groupId: unknown) {
  const group = loadDesktopSyncGroup();
  if (!group || group.group_id !== groupId) throw new Error('sync_group_not_available');
  return `webdav_relay_directory:${group.group_id}:${group.local_device_identity_key}`;
}

export function readCredentialOwner(key: string) {
  const connection = openDatabaseConnection();
  const row = connection.driver.queryOne<{ library_epoch: string }>(
    'SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1'
  );
  if (!row?.library_epoch) throw new Error('request_sync_local_epoch_missing');
  const scope = JSON.stringify([connection.dbPath, row.library_epoch, key]);
  return { connection, scope, ciphertext: readDesktopWebDavCredentialCiphertext(scope) };
}

export function verifyCredentialOwner(previous: ReturnType<typeof readCredentialOwner>, groupId: unknown) {
  const current = readCredentialOwner(requireActiveGroupKey(groupId));
  if (current.connection !== previous.connection || current.scope !== previous.scope ||
    (current.ciphertext ? !previous.ciphertext?.equals(current.ciphertext) : previous.ciphertext !== null)) {
    throw new Error('webdav_relay_settings_changed');
  }
}

export async function loadDesktopWebDavCredentialDraft(groupId: string) {
  const owner = await runWithDatabaseConnectionOwner(() => readCredentialOwner(requireActiveGroupKey(groupId)));
  if (!owner.ciphertext) throw new Error('webdav_relay_credentials_unavailable');
  const draft = await decryptDesktopWebDavCredentialDraft(owner.scope, owner.ciphertext);
  await runWithDatabaseConnectionOwner(() => verifyCredentialOwner(owner, groupId));
  return { draft, owner };
}

export function hasDesktopWebDavCredentialDraft(key: string) {
  try { return readCredentialOwner(key).ciphertext !== null; }
  catch { return false; }
}
