import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BACKUP_MANAGEMENT_FILE = '.foliole-backup-management.json';
const GRACE_MS = 24 * 60 * 60 * 1000;

interface BackupManagement {
  version: 1;
  whitelist: string[];
  temporary: Record<string, number>;
}

function readManagement(directory: string): BackupManagement {
  const file = path.join(directory, BACKUP_MANAGEMENT_FILE);
  if (!existsSync(file)) return { version: 1, whitelist: [], temporary: {} };
  const value = JSON.parse(readFileSync(file, 'utf8')) as BackupManagement;
  if (value.version !== 1 || !Array.isArray(value.whitelist) ||
      value.whitelist.some((name) => typeof name !== 'string' || path.basename(name) !== name) ||
      !value.temporary || typeof value.temporary !== 'object' || Array.isArray(value.temporary) ||
      Object.entries(value.temporary).some(([name, deadline]) =>
        path.basename(name) !== name || !Number.isFinite(deadline))) {
    throw new Error('Invalid backup management record; cleanup stopped.');
  }
  return value;
}

function writeManagement(directory: string, value: BackupManagement) {
  const file = path.join(directory, BACKUP_MANAGEMENT_FILE);
  const temporaryFile = `${file}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporaryFile, file);
}

export function registerGeneratedBackup(filePath: string) {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);
  const record = readManagement(directory);
  if (!record.whitelist.includes(name)) record.whitelist.push(name);
  delete record.temporary[name];
  writeManagement(directory, record);
}

export function forgetManagedBackup(filePath: string) {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);
  const record = readManagement(directory);
  record.whitelist = record.whitelist.filter((candidate) => candidate !== name);
  delete record.temporary[name];
  writeManagement(directory, record);
}

export function reconcileBackupManagement(directory: string, names: string[], now = Date.now()) {
  if (!existsSync(directory)) return { whitelist: new Set<string>(), expired: new Set<string>() };
  const record = readManagement(directory);
  const present = new Set(names);
  record.whitelist = record.whitelist.filter((name) => present.has(name));
  for (const name of Object.keys(record.temporary)) {
    if (!present.has(name)) delete record.temporary[name];
  }
  const whitelist = new Set(record.whitelist);
  for (const name of names) {
    if (!whitelist.has(name) && !Object.hasOwn(record.temporary, name)) {
      record.temporary[name] = now + GRACE_MS;
    }
  }
  writeManagement(directory, record);
  return {
    whitelist,
    expired: new Set(Object.entries(record.temporary)
      .filter(([, deadline]) => deadline <= now).map(([name]) => name))
  };
}
