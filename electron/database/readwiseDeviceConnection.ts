import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  type ReadwiseHostApiConnection,
  withoutReadwiseHostConnection
} from '../../lib/core/import/readwiseHostSettings.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const FILE_NAME = 'readwise-api-connections-v1.json';

interface LegacyRegistry {
  connections: Record<string, ReadwiseHostApiConnection>;
  version: 1;
}

interface Registry {
  connection: ReadwiseHostApiConnection;
  version: 2;
}

export function loadReadwiseDeviceConnection() {
  return loadRegistry().connection;
}

export function saveReadwiseDeviceConnection(connection: ReadwiseHostApiConnection) {
  writeRegistry({ connection, version: 2 });
}

export function deleteReadwiseDeviceConnection() {
  writeRegistry({ connection: disconnected(), version: 2 });
}

export function migrateLegacyReadwiseDeviceConnection() {
  const raw = loadJsonSetting(READWISE_HOST_SETTINGS_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('apiConnection' in raw)) return;
  const legacy = normalizeReadwiseHostSettings(raw).apiConnection;
  if (legacy.secretRef && loadReadwiseDeviceConnection().secretRef === null) {
    saveReadwiseDeviceConnection(legacy);
  }
  saveJsonSetting(READWISE_HOST_SETTINGS_KEY, withoutReadwiseHostConnection(raw));
}

function loadRegistry(): Registry {
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) return { connection: disconnected(), version: 2 };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Registry | LegacyRegistry;
    if (parsed.version === 2) return parsed;
    return {
      connection: newestLegacyConnection(Object.values(parsed.connections ?? {})),
      version: 2
    };
  } catch {
    throw new Error('readwise_device_connection_invalid');
  }
}

function newestLegacyConnection(connections: ReadwiseHostApiConnection[]) {
  return connections.sort((left, right) => timestamp(right.verifiedAt) - timestamp(left.verifiedAt))[0]
    ?? disconnected();
}

function timestamp(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeRegistry(registry: Registry) {
  const filePath = registryPath();
  const temporaryPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify(registry), { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function registryPath() {
  return path.join(resolveAppPaths().app_config_dir, FILE_NAME);
}

function disconnected(): ReadwiseHostApiConnection {
  return { secretRef: null, state: 'disconnected', verifiedAt: null };
}
