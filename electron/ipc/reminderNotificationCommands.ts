import { shell } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { loadMacosSecurityScopedBookmarkAdapter } from '../macosSecurityScopedBookmarksNative.js';

let pendingPermission: ReturnType<typeof notificationStatus> | undefined;

async function notificationStatus(request = false) {
  if (process.platform !== 'darwin') return 'unsupported';
  const native = loadMacosSecurityScopedBookmarkAdapter();
  if (native.status !== 'ready') return 'unavailable';
  return request ? native.adapter.requestNotificationPermission() : native.adapter.notificationStatus();
}

function requestNotificationPermission() {
  pendingPermission ??= notificationStatus(true).finally(() => { pendingPermission = undefined; });
  return pendingPermission;
}

async function openNotificationSettings() {
  if (process.platform !== 'darwin') throw new Error('Notification settings are unavailable.');
  await shell.openExternal('x-apple.systempreferences:com.apple.Notifications-Settings.extension');
  return null;
}

export function handleReminderNotificationCommand(command: string) {
  if (command === NATIVE_COMMANDS.desktopReminderNotificationStatus) return notificationStatus();
  if (command === NATIVE_COMMANDS.requestDesktopReminderNotificationPermission) return requestNotificationPermission();
  if (command === NATIVE_COMMANDS.openDesktopReminderNotificationSettings) return openNotificationSettings();
  return undefined;
}
