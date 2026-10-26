import { expect, it } from 'vitest';

import { isBackupDirectoryPath, normalizeBackupDirectory } from './backupDirectoryPaths.js';

it.each(['/Volumes/UD/mis/foliole backup', '\\Volumes\\UD\\backup', 'C:backup', 'backup',
  '\\\\server', '/backup', 'C:\\bad\0path'])(
  'rejects a Windows backup path without a complete device location: %s', (value) => {
    expect(isBackupDirectoryPath(value, 'win32')).toBe(false);
    expect(normalizeBackupDirectory(value, 'win32')).toBe(value);
  }
);

it.each(['C:\\Backups', 'D:/Foliole Backups', '\\\\server\\share\\backups',
  '\\\\?\\C:\\Backups', '\\\\?\\UNC\\server\\share\\backups', ''])(
  'accepts a complete Windows backup location or explicit default: %s', (value) => {
    expect(isBackupDirectoryPath(value, 'win32')).toBe(true);
  }
);

it('preserves Mac backup locations and rejects Windows paths on Mac', () => {
  const value = '/Volumes/UD/mis/foliole backup';
  expect(normalizeBackupDirectory(value, 'darwin')).toBe(value);
  expect(isBackupDirectoryPath('D:\\Backups', 'darwin')).toBe(false);
  expect(normalizeBackupDirectory('D:\\Backups', 'darwin')).toBe('D:\\Backups');
});
