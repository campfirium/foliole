import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveAppPaths } from './paths.js';

const STORAGE_NAMESPACE = 'workspace';
const STORAGE_EXT = 'json';
const APP_SETTINGS_NAMESPACE = 'settings';
const APP_SETTINGS_FILE = 'app-settings.json';

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

async function resolveAppSettingsPath(): Promise<string> {
  const storageDir = path.join(resolveAppPaths().app_data_dir, APP_SETTINGS_NAMESPACE);
  await fs.mkdir(storageDir, { recursive: true });
  return path.join(storageDir, APP_SETTINGS_FILE);
}

function createWorkspaceFileName(storageKey: string) {
  return `${sanitizeStorageKey(storageKey)}.${STORAGE_EXT}`;
}

function toUniquePaths(paths: string[]) {
  return [...new Set(paths.map((item) => path.normalize(item)))];
}

export function resolveLegacyWorkspaceCandidatePaths(
  storageKey: string,
  appDataDir = resolveAppPaths().app_data_dir,
  platform = process.platform,
  homeDir = os.homedir()
): string[] {
  const fileName = createWorkspaceFileName(storageKey);
  const candidates: string[] = [];

  if (platform === 'win32') {
    const appDataRoot = path.dirname(appDataDir);
    const appDataParent = path.dirname(appDataRoot);

    const roots = [
      path.join(appDataRoot, 'Local'),
      path.join(appDataParent, 'Local'),
      path.join(homeDir, 'AppData', 'Local')
    ];

    for (const root of roots) {
      candidates.push(path.join(root, 'Foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'com', 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'Foliole', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'foliole', STORAGE_NAMESPACE, fileName));
    }

    return toUniquePaths(candidates);
  }

  if (platform === 'darwin') {
    const roots = [
      path.join(homeDir, 'Library', 'Application Support'),
      path.join(path.dirname(appDataDir), 'Application Support')
    ];
    for (const root of roots) {
      candidates.push(path.join(root, 'Foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
      candidates.push(path.join(root, 'com', 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
    }

    return toUniquePaths(candidates);
  }

  const roots = [path.join(homeDir, '.local', 'share'), path.dirname(path.dirname(appDataDir))];
  for (const root of roots) {
    candidates.push(path.join(root, 'Foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
    candidates.push(path.join(root, 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
    candidates.push(path.join(root, 'com', 'foliole', 'Foliole', 'data', STORAGE_NAMESPACE, fileName));
    candidates.push(path.join(root, 'Foliole', STORAGE_NAMESPACE, fileName));
  }

  return toUniquePaths(candidates);
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

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

function normalizeAppSettingsPayload(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const entries = Object.entries(payload as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(key)) {
      continue;
    }
    if (typeof value !== 'string') {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

interface WorkspacePayloadSummary {
  payload: string;
  nodeCount: number;
  nodeOrderCount: number;
  modifiedAtMs: number;
}

function summarizeWorkspacePayload(payload: string, modifiedAtMs: number): WorkspacePayloadSummary | null {
  try {
    const parsed = JSON.parse(payload) as {
      state?: {
        nodesById?: Record<string, unknown>;
        nodeOrder?: unknown[];
      };
    };
    const state = parsed.state ?? {};
    const nodesById = state.nodesById ?? {};
    const nodeOrder = Array.isArray(state.nodeOrder) ? state.nodeOrder : [];
    return {
      payload,
      nodeCount: Object.keys(nodesById).length,
      nodeOrderCount: nodeOrder.length,
      modifiedAtMs
    };
  } catch {
    return null;
  }
}

async function selectBestLegacyWorkspacePayload(candidatePaths: string[]): Promise<string | null> {
  let selected: WorkspacePayloadSummary | null = null;

  for (const candidatePath of candidatePaths) {
    const candidatePayload = await readFileIfExists(candidatePath);
    if (!candidatePayload || candidatePayload.trim().length === 0) {
      continue;
    }

    const stats = await fs.stat(candidatePath).catch(() => null);
    const modifiedAtMs = stats?.mtimeMs ?? 0;
    const summary = summarizeWorkspacePayload(candidatePayload, modifiedAtMs);
    if (!summary) {
      continue;
    }

    if (!selected) {
      selected = summary;
      continue;
    }

    if (summary.nodeCount > selected.nodeCount) {
      selected = summary;
      continue;
    }
    if (summary.nodeCount === selected.nodeCount && summary.nodeOrderCount > selected.nodeOrderCount) {
      selected = summary;
      continue;
    }
    if (
      summary.nodeCount === selected.nodeCount &&
      summary.nodeOrderCount === selected.nodeOrderCount &&
      summary.modifiedAtMs > selected.modifiedAtMs
    ) {
      selected = summary;
    }
  }

  return selected?.payload ?? null;
}

export async function migrateLegacyWorkspaceState(storageKey: string): Promise<void> {
  const targetPath = await resolveWorkspaceStatePath(storageKey);
  const existingPayload = await readFileIfExists(targetPath);
  if (existingPayload && existingPayload.trim().length > 0) {
    return;
  }

  const candidates = resolveLegacyWorkspaceCandidatePaths(storageKey).filter(
    (candidatePath) => path.normalize(candidatePath) !== path.normalize(targetPath)
  );
  const bestPayload = await selectBestLegacyWorkspacePayload(candidates);
  if (!bestPayload) {
    return;
  }
  await fs.writeFile(targetPath, bestPayload, 'utf8');
  await fs.copyFile(targetPath, `${targetPath}.bak-from-tauri-${Date.now()}`);
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

export async function loadAppSettingsState(): Promise<Record<string, string>> {
  const settingsPath = await resolveAppSettingsPath();
  const payload = await readFileIfExists(settingsPath);
  if (!payload) {
    return {};
  }
  try {
    return normalizeAppSettingsPayload(JSON.parse(payload) as unknown);
  } catch {
    return {};
  }
}

export async function saveAppSettingsState(settings: Record<string, unknown>): Promise<void> {
  const settingsPath = await resolveAppSettingsPath();
  const normalized = normalizeAppSettingsPayload(settings);
  await fs.writeFile(settingsPath, JSON.stringify(normalized), 'utf8');
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
