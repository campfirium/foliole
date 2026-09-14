import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  type ReadwiseHostApiConnection,
  withoutReadwiseHostConnection
} from '../../lib/core/import/readwiseHostSettings.js';
import {
  normalizeReadwiseRemoteSource,
  READWISE_REMOTE_SOURCE_KEY
} from '../../lib/core/readwise/readwiseRemoteIdentity.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const FILE_NAME = 'readwise-api-connections-v1.json';

interface Registry {
  connections: Record<string, ReadwiseHostApiConnection>;
  version: 1;
}

export function loadReadwiseDeviceConnection(connectionRef: string | null) {
  if (!connectionRef) return disconnected();
  return loadRegistry().connections[connectionRef] ?? disconnected();
}

export function saveReadwiseDeviceConnection(
  connectionRef: string,
  connection: ReadwiseHostApiConnection
) {
  const registry = loadRegistry();
  registry.connections[connectionRef] = connection;
  writeRegistry(registry);
}

export function deleteReadwiseDeviceConnection(connectionRef: string) {
  const registry = loadRegistry();
  if (!registry.connections[connectionRef]) return;
  delete registry.connections[connectionRef];
  writeRegistry(registry);
}

export function migrateLegacyReadwiseDeviceConnection() {
  const raw = loadJsonSetting(READWISE_HOST_SETTINGS_KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('apiConnection' in raw)) return;
  const source = normalizeReadwiseRemoteSource(loadJsonSetting(READWISE_REMOTE_SOURCE_KEY));
  const legacy = normalizeReadwiseHostSettings(raw).apiConnection;
  if (source && legacy.secretRef && loadReadwiseDeviceConnection(source.connectionRef).secretRef === null) {
    saveReadwiseDeviceConnection(source.connectionRef, legacy);
  }
  saveJsonSetting(READWISE_HOST_SETTINGS_KEY, withoutReadwiseHostConnection(raw));
}

function loadRegistry(): Registry {
  const filePath = registryPath();
  if (!fs.existsSync(filePath)) return { connections: {}, version: 1 };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Registry;
    return parsed.version === 1 && parsed.connections && typeof parsed.connections === 'object'
      ? parsed : { connections: {}, version: 1 };
  } catch {
    throw new Error('readwise_device_connection_invalid');
  }
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
