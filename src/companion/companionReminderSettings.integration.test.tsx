import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import {
  closeIosCompanionDatabase, initializeIosCompanionDatabase
} from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';

import { CompanionReminderSettingsContent } from './CompanionReminderSettingsContent';

const host = vi.hoisted(() => ({
  platform: 'android', bootstrap: null as NativeCompanionBootstrapState | null, granted: true,
  pending: new Map<number, LocalNotificationSchema>()
}));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: createCompanionNativeSyncStub };
});
vi.mock('../shared/platform/companionBootstrap', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionBootstrap')>(),
  loadCompanionBootstrapState: () => Promise.resolve(host.bootstrap)
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    getPending: async () => ({ notifications: [...host.pending.values()] }),
    checkPermissions: async () => ({ display: host.granted ? 'granted' : 'denied' }),
    requestPermissions: async () => ({ display: host.granted ? 'granted' : 'denied' }),
    schedule: async ({ notifications }: { notifications: LocalNotificationSchema[] }) => {
      for (const item of notifications) host.pending.set(item.id, item);
    },
    cancel: async ({ notifications }: { notifications: { id: number }[] }) => {
      for (const item of notifications) host.pending.delete(item.id);
    }
  }
}));

let root = '';
let sqlite: Database.Database | null = null;
async function open(platform: 'android' | 'ios') {
  const file = path.join(root, 'library.db');
  const existed = existsSync(file);
  const db = sqlite = new Database(file);
  host.platform = platform;
  host.bootstrap = await initializeIosCompanionDatabase({
    booted_at: '2026-11-10T00:00:00Z', database_path: null, database_ready: false,
    host_name: 'Reminder fixture', runtime_kind: `${platform}-capacitor`
  }, createFakeCapacitorDatabaseManager(db, existed, () => { sqlite = null; }));
}

afterEach(async () => {
  await closeIosCompanionDatabase();
  if (sqlite?.open) sqlite.close();
  if (root) rmSync(root, { recursive: true, force: true });
  host.pending.clear();
  host.granted = true;
});

async function save(expected = 'Reminder saved.') {
  const button = screen.getByRole('button', { name: 'Save reminder' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByText(expected)).toBeVisible();
}

function setDraft(message: string, time: string) {
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: message } });
  fireEvent.change(screen.getByLabelText('Time each day'), { target: { value: time } });
}

function pendingTimes() {
  return [...host.pending.values()].map(item => [item.body, item.schedule?.on, item.isExactNotification]);
}

it.each(['android', 'ios'] as const)('keeps independent %s reminders across reopen and replaces or cancels the old schedule', async platform => {
  root = mkdtempSync(path.join(os.tmpdir(), 'foliole-reminder-'));
  await open(platform);
  const view = render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  setDraft('Open Foliole', '20:00');
  await save();
  setDraft('Start reading', '21:15');
  await save();
  expect(pendingTimes()).toEqual([
    ['Open Foliole', { hour: 20, minute: 0, second: 0 }, false],
    ['Start reading', { hour: 21, minute: 15, second: 0 }, false]
  ]);
  view.unmount();
  await closeIosCompanionDatabase();
  await open(platform);
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: '20:00 · Open Foliole' }));
  setDraft('Open Foliole', '20:30');
  await save();
  expect(pendingTimes()).toEqual([
    ['Start reading', { hour: 21, minute: 15, second: 0 }, false],
    ['Open Foliole', { hour: 20, minute: 30, second: 0 }, false]
  ]);
  fireEvent.click(screen.getByRole('button', { name: '20:30 · Open Foliole' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Enabled' }));
  await save();
  expect(pendingTimes()).toEqual([['Start reading', { hour: 21, minute: 15, second: 0 }, false]]);
  expect(screen.getByRole('button', { name: '20:30 · Open Foliole · Off' })).toBeVisible();
});

it('keeps the rule when notification permission is denied and schedules after permission is restored', async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'foliole-reminder-permission-'));
  await open('android');
  host.granted = false;
  render(<CompanionReminderSettingsContent onBack={() => undefined} />);
  setDraft('Open Foliole', '20:00');
  await save('Reminder saved. Allow notifications in system settings to receive it.');
  expect(pendingTimes()).toEqual([]);
  host.granted = true;
  fireEvent.click(screen.getByRole('button', { name: '20:00 · Open Foliole' }));
  await save();
  expect(pendingTimes()).toEqual([['Open Foliole', { hour: 20, minute: 0, second: 0 }, false]]);
});
