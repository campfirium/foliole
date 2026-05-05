import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveAppPaths } from './paths.js';

const APP_SETTINGS_NAMESPACE = 'settings';
const APP_SETTINGS_FILE = 'app-settings.json';

async function resolveAppSettingsPath(): Promise<string> {
  const storageDir = path.join(resolveAppPaths().app_data_dir, APP_SETTINGS_NAMESPACE);
  await fs.mkdir(storageDir, { recursive: true });
  return path.join(storageDir, APP_SETTINGS_FILE);
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
