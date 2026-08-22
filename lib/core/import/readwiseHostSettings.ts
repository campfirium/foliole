import {
  createDefaultReadwiseReaderConfig,
  normalizeReadwiseReaderConfig,
  type ReadwiseReaderConfig
} from './readwiseReaderSettings.js';

export const READWISE_HOST_SETTINGS_KEY = 'readwise_import_settings';
export const READWISE_HOST_SETTINGS_VERSION = 1;

export interface ReadwiseHostSettings {
  readwiseReaderConfig: ReadwiseReaderConfig;
  readwiseRootPath: string;
  updatedAt: string;
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createDefaultReadwiseHostSettings(): ReadwiseHostSettings {
  return {
    readwiseReaderConfig: createDefaultReadwiseReaderConfig(),
    readwiseRootPath: '',
    updatedAt: '1970-01-01T00:00:00.000Z',
    version: READWISE_HOST_SETTINGS_VERSION
  };
}

export function normalizeReadwiseHostSettings(value: unknown): ReadwiseHostSettings {
  const defaults = createDefaultReadwiseHostSettings();
  const payload = isRecord(value) ? value : {};
  return {
    readwiseReaderConfig: normalizeReadwiseReaderConfig(payload.readwiseReaderConfig),
    readwiseRootPath: typeof payload.readwiseRootPath === 'string' ? payload.readwiseRootPath : '',
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : defaults.updatedAt,
    version: READWISE_HOST_SETTINGS_VERSION
  };
}

export function readwiseHostSettingsFromImportManager(value: unknown): ReadwiseHostSettings {
  const payload = isRecord(value) ? value : {};
  return normalizeReadwiseHostSettings({
    readwiseReaderConfig: payload.readwiseReaderConfig,
    readwiseRootPath: payload.readwiseRootPath,
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
