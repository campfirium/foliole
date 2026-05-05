import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

import { type WorkspaceSurfaceAutoPaletteOptions } from './workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from './workspaceSurfaceColor';

export type WorkspaceSurfaceGeneratorMode = 'automatic' | 'random' | 'manual' | null;

const DEFAULT_AUTO_OPTIONS: WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

export const DEFAULT_WORKSPACE_SURFACE_AUTO_SEED = '#7a7a7a';

function parseStoredJson(key: string) {
  const raw = getWhitelistedLocalStorageItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function getWorkspaceSurfaceGeneratorMode(): WorkspaceSurfaceGeneratorMode {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceGeneratorMode);
  return raw === 'automatic' || raw === 'random' || raw === 'manual' ? raw : null;
}

export function setWorkspaceSurfaceGeneratorMode(value: WorkspaceSurfaceGeneratorMode) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceGeneratorMode, value ?? 'manual');
}

export function getWorkspaceSurfaceRecommendationId() {
  return getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRecommendationId);
}

export function setWorkspaceSurfaceRecommendationId(value: string | null) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRecommendationId, value ?? '');
}

export function getWorkspaceSurfaceAutoSeed(fallback?: string) {
  const parsed = parseWorkspaceSurfaceColor(
    getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoSeed) ?? fallback ?? DEFAULT_WORKSPACE_SURFACE_AUTO_SEED
  );
  return parsed ?? parseWorkspaceSurfaceColor(DEFAULT_WORKSPACE_SURFACE_AUTO_SEED)!;
}

export function setWorkspaceSurfaceAutoSeed(value: WorkspaceSurfaceColorValue) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoSeed, formatWorkspaceSurfaceColorCss(value));
}

export function getWorkspaceSurfaceAutoOptions(): WorkspaceSurfaceAutoPaletteOptions {
  const parsed = parseStoredJson(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoOptions);
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_AUTO_OPTIONS;
  }
  return {
    documentPureWhite: Boolean((parsed as Record<string, unknown>).documentPureWhite),
    folderTopicSharedTone: Boolean((parsed as Record<string, unknown>).folderTopicSharedTone)
  };
}

export function setWorkspaceSurfaceAutoOptions(value: WorkspaceSurfaceAutoPaletteOptions) {
  setWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoOptions, JSON.stringify(value));
}
