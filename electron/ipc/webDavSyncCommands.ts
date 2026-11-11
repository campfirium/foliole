import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { beginDesktopWebDavCredentialDelivery, confirmDesktopWebDavCredentialFingerprint } from '../sync/desktopWebDavCredentialDelivery.js';
import { openDesktopWebDavRelayLog } from '../sync/desktopWebDavRelayLog.js';
import {
  enableDesktopWebDavRelay, loadDesktopWebDavRelayDirectory, saveDesktopWebDavAttachmentPolicy,
  saveDesktopWebDavRelayCredentials, saveDesktopWebDavRelayDirectory
} from '../sync/desktopWebDavRelaySettings.js';

import { asString } from './commandParsers.js';

export function handleWebDavSyncCommand(command: string, args: Record<string, unknown>) {
  if (command === NATIVE_COMMANDS.openWebDavRelayLog) return openDesktopWebDavRelayLog();
  if (command === NATIVE_COMMANDS.enableWebDavRelay) {
    if (args.authenticated === true) return beginDesktopWebDavCredentialDelivery(
      asString(args.group_id, 'group_id'), asString(args.device_id, 'device_id')
    );
    return enableDesktopWebDavRelay(args.group_id, args.device_id).then(() => null);
  }
  if (command === NATIVE_COMMANDS.confirmWebDavCredentialDelivery) return confirmDesktopWebDavCredentialFingerprint(
    asString(args.group_id, 'group_id'), asString(args.id, 'id'), asString(args.fingerprint, 'fingerprint'),
    { username: asString(args.username, 'username'), password: asString(args.password, 'password') }
  );
  if (command === NATIVE_COMMANDS.loadWebDavRelayDirectory) return loadDesktopWebDavRelayDirectory(args.group_id);
  if (command === NATIVE_COMMANDS.saveWebDavRelayDirectory) {
    if (args.credentials !== undefined) {
      return saveDesktopWebDavRelayCredentials(args.group_id, args.directory_url, args.credentials);
    }
    return saveDesktopWebDavRelayDirectory(args.group_id, args.directory_url);
  }
  if (command === NATIVE_COMMANDS.saveWebDavAttachmentPolicy) {
    return saveDesktopWebDavAttachmentPolicy(args.group_id, args.policy);
  }
  return undefined;
}
