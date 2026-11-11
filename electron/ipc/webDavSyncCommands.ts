import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { beginDesktopWebDavCredentialDelivery, confirmDesktopWebDavCredentialFingerprint } from '../sync/desktopWebDavCredentialDelivery.js';
import { openDesktopWebDavRelayLog } from '../sync/desktopWebDavRelayLog.js';
import {
  enableDesktopWebDavRelay, loadDesktopWebDavRelayDirectory, saveDesktopWebDavAttachmentPolicy,
  saveDesktopWebDavRelayCredentials, saveDesktopWebDavRelayDirectory
} from '../sync/desktopWebDavRelaySettings.js';
import {
  loadDesktopWebDavSetupDraft, resolveDesktopWebDavSetupPassword, saveDesktopWebDavSetupDraft
} from '../sync/desktopWebDavSetupDraft.js';

import { asString } from './commandParsers.js';

export function handleWebDavSyncCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.openWebDavRelayLog) return openDesktopWebDavRelayLog();
  if (command === NATIVE_COMMANDS.enableWebDavRelay) {
    if (args.authenticated === true) return beginDesktopWebDavCredentialDelivery(
      asString(args.group_id, 'group_id'), asString(args.device_id, 'device_id'), args.verify_device === true
    );
    return enableDesktopWebDavRelay(args.group_id, args.device_id).then(() => null);
  }
  if (command === NATIVE_COMMANDS.confirmWebDavCredentialDelivery) return confirmDesktopWebDavCredentialFingerprint(
    asString(args.group_id, 'group_id'), asString(args.id, 'id'),
    args.fingerprint === undefined ? undefined : asString(args.fingerprint, 'fingerprint'),
    { username: asString(args.username, 'username'), password: asString(args.password, 'password') }
  );
  if (command === NATIVE_COMMANDS.loadWebDavRelayDirectory) return loadDesktopWebDavRelayDirectory(args.group_id);
  if (command === NATIVE_COMMANDS.loadWebDavSetupDraft) return loadDesktopWebDavSetupDraft(args.group_id);
  if (command === NATIVE_COMMANDS.saveWebDavSetupDraft) return saveDesktopWebDavSetupDraft(args.group_id, args.draft);
  if (command === NATIVE_COMMANDS.saveWebDavRelayDirectory) {
    if (args.use_setup_password === true) {
      const username = asString((args.credentials as { username?: unknown } | undefined)?.username, 'username');
      return resolveDesktopWebDavSetupPassword(args.group_id, args.directory_url, username).then(password =>
        saveDesktopWebDavRelayCredentials(args.group_id, args.directory_url, { username, password }, args.new_folder_name));
    }
    if (args.credentials !== undefined) {
      return saveDesktopWebDavRelayCredentials(args.group_id, args.directory_url, args.credentials, args.new_folder_name);
    }
    if (args.new_folder_name !== undefined) throw new Error('webdav_relay_invalid_credentials');
    return saveDesktopWebDavRelayDirectory(args.group_id, args.directory_url);
  }
  if (command === NATIVE_COMMANDS.saveWebDavAttachmentPolicy) {
    return saveDesktopWebDavAttachmentPolicy(args.group_id, args.policy);
  }
  return undefined;
}
