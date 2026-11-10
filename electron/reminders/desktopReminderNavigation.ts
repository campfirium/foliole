import type { BrowserWindow } from 'electron';

import type { ReminderRule } from '../../lib/core/reminders/reminderRule.js';
import { DESKTOP_REMINDER_OPEN_DIVE_PREFIX, DESKTOP_REMINDER_OPEN_FLOW } from '../../lib/platform/nativeReminderContract.js';
import { waitForRendererAppReady } from '../ipc/boot.js';
import { IPC_MENU_EVENT_CHANNEL, type MenuCommandEvent } from '../ipc/contracts.js';

let openMainWindow: (() => Promise<BrowserWindow | null>) | undefined;

export function installDesktopReminderNavigation(openWindow: () => Promise<BrowserWindow | null>) {
  openMainWindow = openWindow;
}

export async function openDesktopReminderDestination(destination: ReminderRule['destination']) {
  if (!destination) return;
  const window = await openMainWindow?.();
  if (!window) return;
  await waitForRendererAppReady();
  if (window.isDestroyed()) return;
  const payload: MenuCommandEvent = { commandId: destination === 'flow' ? DESKTOP_REMINDER_OPEN_FLOW : DESKTOP_REMINDER_OPEN_DIVE_PREFIX + destination.diveId };
  window.webContents.send(IPC_MENU_EVENT_CHANNEL, payload);
}
