import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveAppPaths } from './paths.js';

const STORAGE_NAMESPACE = 'workspace';
const STORAGE_EXT = 'json';

function sanitizeStorageKey(storageKey: string): string {
  const isValidLength = storageKey.length > 0 && storageKey.length <= 128;
  if (!isValidLength) {
    throw new Error('workspace storage key has invalid length');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(storageKey)) {
    throw new Error('workspace storage key contains unsupported characters');
  }
  return storageKey;
}

async function resolveWorkspaceStatePath(storageKey: string): Promise<string> {
  const sanitizedKey = sanitizeStorageKey(storageKey);
  const storageDir = path.join(resolveAppPaths().app_data_dir, STORAGE_NAMESPACE);
  await fs.mkdir(storageDir, { recursive: true });
  return path.join(storageDir, `${sanitizedKey}.${STORAGE_EXT}`);
}

async function backupExistingWorkspaceState(statePath: string) {
  try {
    await fs.access(statePath);
  } catch {
    return;
  }
  const timestamp = Date.now();
  const backupPath = `${statePath}.bak-${timestamp}`;
  await fs.copyFile(statePath, backupPath);
}

export async function loadWorkspaceState(storageKey: string): Promise<string | null> {
  const statePath = await resolveWorkspaceStatePath(storageKey);
  try {
    return await fs.readFile(statePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new Error(`read workspace state failed: ${(error as Error).message}`);
  }
}

export async function saveWorkspaceState(storageKey: string, payload: string): Promise<void> {
  const statePath = await resolveWorkspaceStatePath(storageKey);
  await backupExistingWorkspaceState(statePath);
  await fs.writeFile(statePath, payload, 'utf8');
}

export async function clearWorkspaceState(storageKey: string): Promise<void> {
  const statePath = await resolveWorkspaceStatePath(storageKey);
  try {
    await fs.unlink(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw new Error(`clear workspace state failed: ${(error as Error).message}`);
  }
}
