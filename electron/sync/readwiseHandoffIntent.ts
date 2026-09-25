import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { openDatabaseConnection } from '../database/connection.js';
import { resolveAppPaths } from '../ipc/paths.js';

export interface ReadwiseHandoffIntent {
  dbPath: string;
  groupId: string;
  mode: 'api' | 'relay';
  ownerId: string | null;
  epoch: number;
  targetId: string;
  selectionSource?: 'automatic' | 'chosen';
  forceCurrent?: boolean;
}

interface Registry {
  version: 1;
  entries: Record<string, ReadwiseHandoffIntent>;
}

function registryPath() {
  return path.join(resolveAppPaths().app_config_dir, 'readwise-handoff-intent-v1.json');
}

function key(groupId: string) {
  return createHash('sha256').update(groupId).update('\0')
    .update(openDatabaseConnection().dbPath).digest('hex');
}

function readRegistry(): Registry {
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) return { version: 1, entries: {} };
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Registry;
    if (value.version !== 1 || !value.entries || typeof value.entries !== 'object') throw new Error();
    return value;
  } catch { throw new Error('readwise_handoff_intent_invalid'); }
}

function writeRegistry(registry: Registry) {
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

export function loadReadwiseHandoffIntent(groupId: string): ReadwiseHandoffIntent | null {
  const intent = readRegistry().entries[key(groupId)];
  if (!intent) return null;
  if (intent.groupId !== groupId || intent.dbPath !== openDatabaseConnection().dbPath ||
      !['api', 'relay'].includes(intent.mode) ||
      !Number.isSafeInteger(intent.epoch) || intent.epoch < 0 ||
      !(intent.ownerId === null || typeof intent.ownerId === 'string') ||
      (intent.selectionSource !== undefined && !['automatic', 'chosen'].includes(intent.selectionSource)) ||
      (intent.forceCurrent !== undefined && typeof intent.forceCurrent !== 'boolean') ||
      typeof intent.targetId !== 'string' || !intent.targetId) {
    throw new Error('readwise_handoff_intent_invalid');
  }
  return intent;
}

export function saveReadwiseHandoffIntent(intent: ReadwiseHandoffIntent | null, groupId: string) {
  const registry = readRegistry();
  if (intent) registry.entries[key(groupId)] = intent;
  else delete registry.entries[key(groupId)];
  writeRegistry(registry);
}
