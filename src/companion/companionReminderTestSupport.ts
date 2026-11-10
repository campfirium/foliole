import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ActionPerformed, LocalNotificationSchema, RegisterActionTypesOptions } from '@capacitor/local-notifications';
import Database from 'better-sqlite3';
import { afterEach, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import type { AndroidReminderJob } from '../shared/platform/companion/settings/companionAndroidReminderNotifications';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';

const host = vi.hoisted(() => ({
  platform: 'android', bootstrap: null as NativeCompanionBootstrapState | null, granted: true, exactGranted: true,
  androidJobs: new Map<number, AndroidReminderJob>(),
  actions: [] as RegisterActionTypesOptions['types'],
  pending: new Map<number, LocalNotificationSchema>(), tap: undefined as ((event: ActionPerformed) => Promise<void>) | undefined
}));

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => host.platform, isNativePlatform: () => true, isPluginAvailable: () => false },
    registerPlugin: (name: string) => name === 'FolioleReminderNotifications' ? {
      list: async () => ({ jobs: [...host.androidJobs.values()] }),
      cancel: async ({ id }: { id: number }) => { host.androidJobs.delete(id); host.pending.delete(id); },
      schedule: async (job: AndroidReminderJob) => {
        host.androidJobs.set(job.id, job);
        host.pending.set(job.id, { id: job.id, title: 'Foliole', body: job.body, isExactNotification: true,
          actionTypeId: 'native-android', schedule: { at: new Date(job.at), repeats: false, allowWhileIdle: true },
          extra: { owner: job.owner, ruleId: job.ruleId, revision: job.revision, occurrenceAt: job.at } });
      }
    } : createCompanionNativeSyncStub() };
});
vi.mock('../shared/platform/companionBootstrap', async importOriginal => ({
  ...await importOriginal<typeof import('../shared/platform/companionBootstrap')>(),
  loadCompanionBootstrapState: () => Promise.resolve(host.bootstrap)
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: async (_name: string, callback: typeof host.tap) => {
      host.tap = callback;
      return { remove: async () => { host.tap = undefined; } };
    },
    registerActionTypes: async ({ types }: RegisterActionTypesOptions) => { host.actions = types; },
    getPending: async () => ({ notifications: [...host.pending.values()].filter(item => !host.androidJobs.has(item.id)) }),
    checkPermissions: async () => ({ display: host.granted ? 'granted' : 'denied' }),
    requestPermissions: async () => ({ display: host.granted ? 'granted' : 'denied' }),
    checkExactNotificationSetting: async () => ({ exact_alarm: host.exactGranted ? 'granted' : 'denied' }),
    changeExactNotificationSetting: async () => ({ exact_alarm: host.exactGranted ? 'granted' : 'denied' }),
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
export async function open(platform: 'android' | 'ios', prefix?: string) {
  if (prefix) root = mkdtempSync(path.join(os.tmpdir(), prefix));
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
  host.androidJobs.clear();
  host.actions = [];
  window.localStorage.clear();
  host.granted = true;
  host.exactGranted = true;
});


export { host };
