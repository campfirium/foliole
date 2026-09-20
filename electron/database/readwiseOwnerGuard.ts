import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveAppPaths } from '../ipc/paths.js';

import { openDatabaseConnection } from './connection.js';

const FILE_NAME = 'readwise-owner-guard-v1.json';

export interface ReadwiseOwnerGuard {
  epoch: number;
  groupId: string;
  mode: 'api' | 'relay';
  ownerId: string;
  state: 'active' | 'relinquished';
  targetId: string | null;
}

interface Registry {
  entries: Record<string, ReadwiseOwnerGuard>;
  version: 1;
}

function guardKey(groupId: string) {
  return createHash('sha256').update(groupId).update('\0')
    .update(openDatabaseConnection().dbPath).digest('hex');
}

function registryPath() {
  return path.join(resolveAppPaths().app_config_dir, FILE_NAME);
}

function readRegistry(): Registry {
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) return { entries: {}, version: 1 };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Registry;
    if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') throw new Error();
    return parsed;
  } catch { throw new Error('readwise_owner_guard_invalid'); }
}

export function loadReadwiseOwnerGuard(groupId: string) {
  const guard = readRegistry().entries[guardKey(groupId)];
  if (!guard) return null;
  if (guard.groupId !== groupId || !Number.isSafeInteger(guard.epoch) || guard.epoch < 0 ||
      !guard.ownerId || !['api', 'relay'].includes(guard.mode) ||
      !['active', 'relinquished'].includes(guard.state) ||
      (guard.state === 'relinquished' && !guard.targetId)) {
    throw new Error('readwise_owner_guard_invalid');
  }
  return guard;
}

export function saveReadwiseOwnerGuard(guard: ReadwiseOwnerGuard) {
  const registry = readRegistry();
  const key = guardKey(guard.groupId);
  const previous = registry.entries[key];
  if (previous && (previous.epoch > guard.epoch ||
      (previous.epoch === guard.epoch && previous.ownerId !== guard.ownerId))) {
    throw new Error('readwise_owner_guard_epoch_regressed');
  }
  registry.entries[key] = guard;
  const filePath = registryPath();
  const temporaryPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const handle = fs.openSync(temporaryPath, 'w', 0o600);
  try {
    fs.writeFileSync(handle, JSON.stringify(registry));
    fs.fsyncSync(handle);
  } finally { fs.closeSync(handle); }
  fs.renameSync(temporaryPath, filePath);
  if (process.platform !== 'win32') {
    const directory = fs.openSync(path.dirname(filePath), 'r');
    try { fs.fsyncSync(directory); }
    finally { fs.closeSync(directory); }
  }
}
