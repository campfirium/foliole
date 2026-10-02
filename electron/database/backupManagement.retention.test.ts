// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { listManagedDatabaseBackups, pruneManagedDatabaseBackups } from './backupCatalog.js';
import { showBackupCleanupNotification } from './backupCleanupNotification.js';
import { BACKUP_MANAGEMENT_FILE, registerGeneratedBackup } from './backupManagement.js';
import { DEFAULT_BACKUP_SETTINGS } from './backupSettingsDefaults.js';
import { copyExtraBackup } from './extraBackupCopies.js';

const notices = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: () => ['en'] },
  Notification: class {
    static isSupported() { return true; }
    show = notices.show;
  }
}));

let directory = '';
const discoveredAt = Date.UTC(2026, 9, 2, 10);
const day = 24 * 60 * 60 * 1000;
const ordinaryName = 'foliole-auto-261002-100000.db';
const copiedName = 'foliole-auto-250101-100000.db';

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-backup-grace-'));
  notices.show.mockClear();
});

afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

it('protects copied old files at capacity and expires them without joining the whitelist', async () => {
  await writeBackup(ordinaryName, true);
  await writeBackup(copiedName, false);
  const originalTime = (await fs.stat(path.join(directory, copiedName))).mtimeMs;
  await prune(discoveredAt);
  expect(await names()).toEqual(expect.arrayContaining([ordinaryName, copiedName]));
  expect((await fs.stat(path.join(directory, copiedName))).mtimeMs).toBe(originalTime);
  const firstRecord = await record();
  expect(firstRecord.whitelist).toEqual([ordinaryName]);
  expect(firstRecord.temporary).toEqual({ [copiedName]: discoveredAt + day });
  // Reload the durable record on every call, as after a process restart.
  await prune(discoveredAt + day - 1);
  expect(await record()).toEqual(firstRecord);
  const expired = await prune(discoveredAt + day);
  expect(expired).toMatchObject({ deletedCount: 1, temporaryDeletedCount: 1 });
  expect(await names()).toEqual([ordinaryName]);
  expect(await record()).toEqual({ version: 1, whitelist: [ordinaryName], temporary: {} });
  showBackupCleanupNotification(expired);
  expect(notices.show).not.toHaveBeenCalled();
});

it('does not give generated hourly backups a grace period', async () => {
  await writeBackup(copiedName, true);
  await writeBackup(ordinaryName, true);
  await prune(discoveredAt);
  expect(await names()).toEqual([ordinaryName]);
  expect((await record()).temporary).toEqual({});
});

it('gives a previously cleaned file a fresh temporary deadline when copied back', async () => {
  await writeBackup(copiedName, true);
  await writeBackup(ordinaryName, true);
  const preservedCopy = path.join(directory, 'saved-copy');
  await fs.copyFile(path.join(directory, copiedName), preservedCopy);
  await prune(discoveredAt);
  await fs.copyFile(preservedCopy, path.join(directory, copiedName));
  await fs.utimes(path.join(directory, copiedName), new Date('2025-01-01'), new Date('2025-01-01'));
  await prune(discoveredAt + day);
  expect((await record()).temporary[copiedName]).toBe(discoveredAt + 2 * day);
});

it('keeps expired registration after trash failure and retries without extending it', async () => {
  await writeBackup(copiedName, false);
  await prune(discoveredAt);
  const failed = await prune(discoveredAt + day, async () => { throw new Error('occupied'); });
  expect(failed).toMatchObject({ deletedCount: 0, failedCount: 1 });
  expect((await record()).temporary[copiedName]).toBe(discoveredAt + day);
  await prune(discoveredAt + 2 * day);
  expect(await names()).toEqual([]);
  expect((await record()).temporary).toEqual({});
});

it('removes missing registrations and leaves unrecognized personal files alone', async () => {
  await writeBackup(ordinaryName, true);
  await writeBackup(copiedName, false);
  await fs.writeFile(path.join(directory, 'personal.db'), 'personal');
  await prune(discoveredAt);
  await fs.rm(path.join(directory, ordinaryName));
  await fs.rm(path.join(directory, copiedName));
  await prune(discoveredAt + day);
  expect(await record()).toEqual({ version: 1, whitelist: [], temporary: {} });
  expect(await fs.readFile(path.join(directory, 'personal.db'), 'utf8')).toBe('personal');
});

it('fails closed before deleting any backups when the record is corrupt', async () => {
  await writeBackup(copiedName, false);
  await fs.writeFile(path.join(directory, BACKUP_MANAGEMENT_FILE), '{invalid');
  const dispose = vi.fn();
  await expect(prune(discoveredAt, dispose)).rejects.toThrow();
  expect(dispose).not.toHaveBeenCalled();
  expect(await names()).toEqual([copiedName]);
});

it('protects external extra copies and clears them on the next copy after their deadline', async () => {
  const extraDirectory = path.join(directory, 'extra');
  await fs.mkdir(extraDirectory);
  await writeBackup(ordinaryName, true);
  const external = path.join(extraDirectory, copiedName);
  await fs.copyFile(path.join(directory, ordinaryName), external);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(discoveredAt);
  const copy = () => copyExtraBackup({ extraBackupDir: extraDirectory, primaryBackupDir: directory,
    sourcePath: path.join(directory, ordinaryName), maxCount: 1,
    disposeFile: async (filePath) => { await fs.rm(filePath); } });
  expect((await copy()).status).toBe('copied');
  await fs.access(external);
  clock.mockReturnValue(discoveredAt + day - 1);
  expect((await copy()).status).toBe('copied');
  await fs.access(external);
  clock.mockReturnValue(discoveredAt + day);
  expect((await copy()).status).toBe('copied');
  await expect(fs.access(external)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not overwrite a protected external extra copy with a matching generated filename', async () => {
  const extraDirectory = path.join(directory, 'extra');
  await fs.mkdir(extraDirectory);
  await writeBackup(ordinaryName, true);
  const external = path.join(extraDirectory, ordinaryName);
  await fs.writeFile(external, 'external backup');
  const result = await copyExtraBackup({ extraBackupDir: extraDirectory, primaryBackupDir: directory,
    sourcePath: path.join(directory, ordinaryName), maxCount: 1,
    disposeFile: async (filePath) => { await fs.rm(filePath); } });
  expect(result.status).toBe('failed');
  expect(await fs.readFile(external, 'utf8')).toBe('external backup');
});

async function writeBackup(name: string, generated: boolean) {
  const filePath = path.join(directory, name);
  await fs.writeFile(filePath, Buffer.alloc(10));
  const time = name === ordinaryName ? new Date('2026-10-02T10:00:00Z') : new Date('2025-01-01T10:00:00Z');
  await fs.utimes(filePath, time, time);
  if (generated) registerGeneratedBackup(filePath);
}

function prune(now: number, disposeFile = async (filePath: string) => { await fs.rm(filePath); }) {
  return pruneManagedDatabaseBackups(directory, { ...DEFAULT_BACKUP_SETTINGS,
    hourly_max_count: 1, daily_max_count: 0, weekly_max_count: 0, monthly_max_count: 0,
    total_size_limit_bytes: 10 }, { disposeFile, now });
}

async function names() { return (await listManagedDatabaseBackups(directory)).map((entry) => entry.fileName); }
async function record() { return JSON.parse(await fs.readFile(path.join(directory, BACKUP_MANAGEMENT_FILE), 'utf8')); }
