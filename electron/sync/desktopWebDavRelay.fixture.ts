import { runWithDatabaseConnectionOwner, openDatabaseConnection } from '../database/connection.js';

import { desktopWebDavRelayOverview, enableDesktopWebDavRelay, saveDesktopWebDavAttachmentPolicy,
  saveDesktopWebDavRelayDirectory } from './desktopWebDavRelaySettings.js';

export async function runDesktopWebDavRelayFixture(action: string, args: Readonly<Record<string, unknown>>) {
  const groupId = 't326-group';
  if (action === 'webdav_enable') return enableDesktopWebDavRelay(groupId, args.phoneId);
  if (action === 'webdav_directory') return saveDesktopWebDavRelayDirectory(groupId, args.directory);
  if (action === 'webdav_attachment_policy') return saveDesktopWebDavAttachmentPolicy(groupId, args.policy);
  return runWithDatabaseConnectionOwner(async () => {
    if (action === 'webdav_phone') return openDatabaseConnection().driver.execute(
      "UPDATE sync_group_devices SET platform = 'android-capacitor' WHERE group_id = ? AND device_identity_key = ?",
      [groupId, String(args.phoneId)]
    );
    return desktopWebDavRelayOverview(groupId);
  });
}
