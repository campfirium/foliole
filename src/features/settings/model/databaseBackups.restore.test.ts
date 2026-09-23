import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../shared/platform/settingsRuntimeRepository', () => ({
  hasSettingsRuntimeRepository: vi.fn(() => true),
  restoreDatabaseBackupInRuntime: vi.fn()
}));

import { restoreDatabaseBackupInRuntime } from '../../../shared/platform/settingsRuntimeRepository';

import { restoreDatabaseBackup } from './databaseBackups';

const unchanged = 'The selected backup was not restored. Your current library is unchanged.';
const recovered = 'The selected backup was not restored. Your current library has been restored.';
const unavailable = 'The selected backup was not restored, and Foliole could not reopen the current library. ' +
  'Keep your backup files and restart Foliole before making more changes.';

beforeEach(() => vi.resetAllMocks());

it.each([unchanged, recovered, unavailable])('preserves the restore outcome without transport details: %s', async (message) => {
  vi.mocked(restoreDatabaseBackupInRuntime).mockRejectedValue(
    new Error(`Error invoking remote method 'foliole:invoke': Error: ${message}`)
  );
  expect(await restoreDatabaseBackup('/isolated/backup.db')).toEqual({ ok: false, errorMessage: message });
});

it.each([new Error('SqliteConnectionOwnerError: /private/library.db'), { message: 'SQLITE_CORRUPT' }, null])(
  'does not expose an unknown restore error or claim unchanged data', async (error) => {
    vi.mocked(restoreDatabaseBackupInRuntime).mockRejectedValue(error);
    const result = await restoreDatabaseBackup('/isolated/backup.db');
    expect(result).toEqual({
      ok: false,
      errorMessage: 'The backup could not be restored. Keep your backup files and restart Foliole before making more changes.'
    });
  }
);
