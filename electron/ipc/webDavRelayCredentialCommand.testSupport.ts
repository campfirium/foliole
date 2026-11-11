import { vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import * as credentialStore from '../security/desktopWebDavCredentialStore.js';
import { desktopSyncChangeSessions } from '../sync/desktopSyncChangeSessions.js';
import * as webDavProbe from '../sync/testWebDavRelayConnection.js';

import { handleInvokeRequest } from './commands.js';

export async function prepareCredentialCommandFixture(groupId: string, directory: string, phone: string, other: string) {
  openDatabaseConnection().sqlite.prepare(`INSERT INTO node_version_device_revisions
    (group_id, device_identity_key, library_epoch, proof_revision, pack_id, updated_at)
    VALUES (?, ?, 'phone-epoch', 1, 'pack', 'now')`).run(groupId, phone);
  desktopSyncChangeSessions().open(phone);
  desktopSyncChangeSessions().open(other);
  vi.spyOn(webDavProbe, 'testWebDavRelayConnection').mockResolvedValue(directory);
  vi.spyOn(credentialStore, 'encryptDesktopWebDavCredentialDraft').mockResolvedValue(Buffer.from('protected fixture'));
  const credentials = { username: 'mac-user', password: 'mac-password' };
  vi.spyOn(credentialStore, 'decryptDesktopWebDavCredentialDraft').mockImplementation(async scope =>
    ({ scope, directory, ...credentials }));
  await handleInvokeRequest({ command: NATIVE_COMMANDS.saveWebDavRelayDirectory,
    args: { group_id: groupId, directory_url: directory, credentials } });
  return loadDesktopSyncGroup()!.local_device_identity_key;
}
