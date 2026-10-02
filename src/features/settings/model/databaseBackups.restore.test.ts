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

it.each([
  [new Error('SQLITE_CORRUPT'), 'SQLITE_CORRUPT'],
  [{ message: 'delivery_authorization_ambiguous:Phone' }, 'delivery_authorization_ambiguous:Phone'],
  [null, 'Unknown desktop runtime error.']
])('preserves unknown errors without claiming unchanged data', async (error, reason) => {
  vi.mocked(restoreDatabaseBackupInRuntime).mockRejectedValue(error);
  expect(await restoreDatabaseBackup('/isolated/backup.db')).toEqual({
    ok: false,
    errorMessage: `The backup could not be restored. Keep your backup files and restart Foliole before making more changes.\nReason: ${reason}`
  });
});

it.each([unchanged, recovered, unavailable])('preserves reasons with the data outcome: %s', async (summary) => {
  const message = `${summary}\nReason: delivery_authorization_ambiguous:Phone`;
  vi.mocked(restoreDatabaseBackupInRuntime).mockRejectedValue(
    new Error(`Error invoking remote method 'foliole:invoke': Error: ${message}`)
  );
  expect(await restoreDatabaseBackup('/isolated/backup.db')).toEqual({ ok: false, errorMessage: message });
});
