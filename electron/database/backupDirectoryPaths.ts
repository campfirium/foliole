import path from 'node:path';

export function isBackupDirectoryPath(value: string, platform = process.platform): boolean {
  if (!value) return true;
  if (value.includes('\0')) return false;
  if (platform !== 'win32') return path.posix.isAbsolute(value);
  const root = path.win32.parse(value).root;
  return path.win32.isAbsolute(value) && root.length > 1;
}

export function normalizeBackupDirectory(value: unknown, platform = process.platform): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || !isBackupDirectoryPath(trimmed, platform)) return trimmed;
  return (platform === 'win32' ? path.win32 : path.posix).normalize(trimmed);
}

export function assertBackupDirectoryPath(value: string, extra = false) {
  if (isBackupDirectoryPath(value)) return;
  throw new Error(`${extra ? 'Extra backup' : 'Backup'} location is not valid on this device. Choose a folder on this device or reset the location.`);
}
