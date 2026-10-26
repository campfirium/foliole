// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('./settingsStore.js', () => ({ loadJsonSetting: store.load, saveJsonSetting: store.save }));
vi.mock('../ipc/libraryPaths.js', () => ({
  loadLibraryPathSettingsSync: () => ({ library_home: '/Library' })
}));

import {
  ensureManagedBackupDirectory, loadBackupSettings, normalizeBackupSettings, saveBackupSettings
} from './backupSettings.js';
import { copyExtraBackup } from './extraBackupCopies.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function useWindows() {
  vi.stubGlobal('process', new Proxy(process, {
    get: (target, key) => key === 'platform' ? 'win32' : Reflect.get(target, key)
  }));
}

it.each(['backup_dir', 'extra_backup_dir'] as const)(
  'retains an invalid stored %s for correction and refuses to create a directory', async (field) => {
    useWindows();
    const stored = { ...normalizeBackupSettings(null), [field]: '/Volumes/UD/mis/foliole backup',
      overridden_fields: [field], updated_at: '2026-10-03T07:07:09.745Z' };
    store.load.mockReturnValue(stored);
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    const loaded = loadBackupSettings();
    expect(loaded[field]).toBe(stored[field]);
    if (field === 'backup_dir') {
      expect(() => ensureManagedBackupDirectory(loaded)).toThrow(/folder on this device/u);
    } else {
      const extraMkdir = vi.spyOn(fs.promises, 'mkdir');
      await expect(copyExtraBackup({ extraBackupDir: loaded.extra_backup_dir,
        primaryBackupDir: 'D:\\Backups', sourcePath: 'D:\\Backups\\backup.db.gz',
        maxCount: 1, disposeFile: vi.fn() })).resolves.toMatchObject({ status: 'failed',
        errorMessage: expect.stringMatching(/folder on this device/u) });
      expect(extraMkdir).not.toHaveBeenCalled();
    }
    expect(mkdir).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  }
);

it.each(['backup_dir', 'extra_backup_dir'] as const)(
  'rejects an invalid new %s without writing settings', (field) => {
    useWindows();
    store.load.mockReturnValue(normalizeBackupSettings(null));
    expect(() => saveBackupSettings({ [field]: '/Volumes/UD/mis/foliole backup' }))
      .toThrow(/folder on this device/u);
    expect(store.save).not.toHaveBeenCalled();
  }
);

it('lets the user explicitly replace a contaminated Windows path with the default', () => {
  useWindows();
  store.load.mockReturnValue({ ...normalizeBackupSettings(null), backup_dir: '/Volumes/UD/backup',
    overridden_fields: ['backup_dir'] });
  const saved = saveBackupSettings({ backup_dir: '' });
  expect(saved.backup_dir).toBe('');
  expect(saved.overridden_fields).not.toContain('backup_dir');
  expect(store.save).toHaveBeenCalledWith('backup_settings', saved, saved.updated_at);
});

it('keeps a valid custom directory usable without changing its owner or location', () => {
  const directory = path.resolve('.tmp/artifacts/T492/custom-backups');
  const settings = normalizeBackupSettings({ backup_dir: directory });
  const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  expect(ensureManagedBackupDirectory(settings)).toBe(directory);
  expect(mkdir).toHaveBeenCalledWith(directory, { recursive: true });
});
