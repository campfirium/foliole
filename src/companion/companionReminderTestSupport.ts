import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ActionPerformed, LocalNotificationSchema } from '@capacitor/local-notifications';
import Database from 'better-sqlite3';
import { afterEach, vi } from 'vitest';

import type { NativeCompanionBootstrapState } from '../../lib/platform/nativeCompanionContract';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';

const host = vi.hoisted(() => ({
  platform: 'android', bootstrap: null as NativeCompanionBootstrapState | null, granted: true, exactGranted: true,
  pending: new Map<number, LocalNotificationSchema>(), tap: undefined as ((event: ActionPerformed) => Promise<void>) | undefined
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
    addListener: async (_name: string, callback: typeof host.tap) => {
      host.tap = callback;
      return { remove: async () => { host.tap = undefined; } };
    },
    getPending: async () => ({ notifications: [...host.pending.values()] }),
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
  host.granted = true;
  host.exactGranted = true;
});


export { host };
