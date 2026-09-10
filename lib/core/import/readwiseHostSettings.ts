import type { ReadwiseSourceMode } from './importManagerSettings.js';
import {
  createDefaultReadwiseReaderConfig,
  normalizeReadwiseReaderConfig,
  type ReadwiseReaderConfig
} from './readwiseReaderSettings.js';

export const READWISE_HOST_SETTINGS_KEY = 'readwise_import_settings';
export const READWISE_HOST_SETTINGS_VERSION = 3;
export const READWISE_HOST_AUTO_IMPORT_POLICY_VERSION = 1;

export interface ReadwiseHostApiConnection {
  secretRef: string | null;
  state: 'connected' | 'disconnected' | 'reconnect_required';
  verifiedAt: string | null;
}

export interface ReadwiseHostSettings {
  autoImportPolicyVersion: typeof READWISE_HOST_AUTO_IMPORT_POLICY_VERSION;
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  readwiseSourceMode: ReadwiseSourceMode;
  apiConnection: ReadwiseHostApiConnection;
  updatedAt: string;
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSecretRef(value: unknown) {
  return typeof value === 'string' && /^readwise-api-[0-9a-f-]{36}\.bin$/u.test(value)
    ? value
    : null;
}

export function createDefaultReadwiseHostSettings(): ReadwiseHostSettings {
  return {
    autoImportPolicyVersion: READWISE_HOST_AUTO_IMPORT_POLICY_VERSION,
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseRootPath: '',
    readwiseSourceMode: 'folder',
    apiConnection: { secretRef: null, state: 'disconnected', verifiedAt: null },
    updatedAt: '1970-01-01T00:00:00.000Z',
    version: READWISE_HOST_SETTINGS_VERSION
  };
}

export function normalizeReadwiseHostSettings(value: unknown): ReadwiseHostSettings {
  const defaults = createDefaultReadwiseHostSettings();
  const payload = isRecord(value) ? value : {};
  if (typeof payload.version === 'number' && payload.version > READWISE_HOST_SETTINGS_VERSION) {
    throw new Error('readwise_host_settings_version_unsupported');
  }
  const apiConnection = isRecord(payload.apiConnection) ? payload.apiConnection : {};
  return {
    autoImportPolicyVersion: READWISE_HOST_AUTO_IMPORT_POLICY_VERSION,
    readwiseReaderConfig: normalizeReadwiseReaderConfig(payload.readwiseReaderConfig),
    readwiseRootPath: typeof payload.readwiseRootPath === 'string' ? payload.readwiseRootPath : '',
    readwiseSourceMode: payload.readwiseSourceMode === 'api' || payload.readwiseSourceMode === 'off'
      ? payload.readwiseSourceMode
      : 'folder',
    apiConnection: {
      secretRef: normalizeSecretRef(apiConnection.secretRef),
      state: apiConnection.state === 'connected' || apiConnection.state === 'reconnect_required'
        ? apiConnection.state : 'disconnected',
      verifiedAt: typeof apiConnection.verifiedAt === 'string' ? apiConnection.verifiedAt : null
    },
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : defaults.updatedAt,
    version: READWISE_HOST_SETTINGS_VERSION
  };
}

export function readwiseHostSettingsFromImportManager(value: unknown): ReadwiseHostSettings {
  const payload = isRecord(value) ? value : {};
  return normalizeReadwiseHostSettings({
    readwiseReaderConfig: payload.readwiseReaderConfig,
    readwiseRootPath: payload.readwiseRootPath,
    readwiseSourceMode: payload.readwiseSourceMode,
    updatedAt: payload.updatedAt
  });
}

export function withoutReadwiseImportManagerFields(value: unknown) {
  const payload = isRecord(value) ? { ...value } : {};
  delete payload.readwiseReaderConfig;
  delete payload.readwiseRootPath;
  delete payload.readwiseSources;
  return payload;
}
