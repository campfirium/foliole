import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';

import { type WorkspaceSurfaceAutoPaletteOptions } from './workspaceSurfaceAutoPalette';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  sanitizeWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue
} from './workspaceSurfaceColor';
import { type WorkspaceSurfaceColorMode } from './workspaceSurfaceSettings';

export type WorkspaceSurfaceGeneratorMode = 'automatic' | 'random' | 'manual' | null;
export type WorkspaceSurfaceRandomHistory = string[][];
export type WorkspaceSurfaceFavorites = string[][];

const DEFAULT_AUTO_OPTIONS: WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

const DEFAULT_WORKSPACE_SURFACE_AUTO_SEED = '#7a7a7a';
const DEFAULT_DARK_WORKSPACE_SURFACE_AUTO_SEED = '#1a1f1e';
const WORKSPACE_SURFACE_RANDOM_HISTORY_LIMIT = 8;

function modeKey(mode: WorkspaceSurfaceColorMode, lightKey: string, darkKey: string) {
  return mode === 'dark' ? darkKey : lightKey;
}

function getModeStorageKeys(mode: WorkspaceSurfaceColorMode) {
  return {
    autoOptions: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoOptions, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoOptionsDark),
    autoSeed: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoSeed, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceAutoSeedDark),
    favorites: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavoritesDark),
    generatorMode: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceGeneratorMode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceGeneratorModeDark),
    randomHistory: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistoryDark),
    recommendationId: modeKey(mode, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRecommendationId, APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRecommendationIdDark)
  };
}

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

export function getWorkspaceSurfaceGeneratorMode(mode: WorkspaceSurfaceColorMode = 'light'): WorkspaceSurfaceGeneratorMode {
  const raw = getWhitelistedLocalStorageItem(getModeStorageKeys(mode).generatorMode);
  return raw === 'automatic' || raw === 'random' || raw === 'manual' ? raw : null;
}

export function setWorkspaceSurfaceGeneratorMode(value: WorkspaceSurfaceGeneratorMode, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(getModeStorageKeys(mode).generatorMode, value ?? 'manual');
}

export function getWorkspaceSurfaceRecommendationId(mode: WorkspaceSurfaceColorMode = 'light') {
  return getWhitelistedLocalStorageItem(getModeStorageKeys(mode).recommendationId);
}

export function setWorkspaceSurfaceRecommendationId(value: string | null, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(getModeStorageKeys(mode).recommendationId, value ?? '');
}

export function getWorkspaceSurfaceAutoSeed(fallback?: string, mode: WorkspaceSurfaceColorMode = 'light') {
  const parsed = parseWorkspaceSurfaceColor(
    getWhitelistedLocalStorageItem(getModeStorageKeys(mode).autoSeed) ??
      fallback ??
      (mode === 'dark' ? DEFAULT_DARK_WORKSPACE_SURFACE_AUTO_SEED : DEFAULT_WORKSPACE_SURFACE_AUTO_SEED)
  );
  return parsed ?? parseWorkspaceSurfaceColor(DEFAULT_WORKSPACE_SURFACE_AUTO_SEED)!;
}

export function setWorkspaceSurfaceAutoSeed(value: WorkspaceSurfaceColorValue, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(getModeStorageKeys(mode).autoSeed, formatWorkspaceSurfaceColorCss(value));
}

export function getWorkspaceSurfaceAutoOptions(mode: WorkspaceSurfaceColorMode = 'light'): WorkspaceSurfaceAutoPaletteOptions {
  const parsed = parseStoredJson(getModeStorageKeys(mode).autoOptions);
  if (!parsed || typeof parsed !== 'object') {
    return DEFAULT_AUTO_OPTIONS;
  }
  return {
    documentPureWhite: Boolean((parsed as Record<string, unknown>).documentPureWhite),
    folderTopicSharedTone: Boolean((parsed as Record<string, unknown>).folderTopicSharedTone)
  };
}

export function setWorkspaceSurfaceAutoOptions(value: WorkspaceSurfaceAutoPaletteOptions, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(getModeStorageKeys(mode).autoOptions, JSON.stringify(value));
}

function normalizeStoredPalette(input: unknown) {
  if (!Array.isArray(input)) {
    return null;
  }
  const palette = input
    .filter((value): value is string => typeof value === 'string')
    .slice(0, 5)
    .map((value, index) => sanitizeWorkspaceSurfaceColor(value, index === 0 ? '#ffffff' : '#f5f5f3'));
  return palette.length === 5 ? palette : null;
}

function normalizePaletteCollection(input: unknown, maxCount = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(input)) {
    return [];
  }
  const next: string[][] = [];
  for (const entry of input) {
    const palette = normalizeStoredPalette(entry);
    if (!palette) {
      continue;
    }
    if (next.some((candidate) => candidate.join('|') === palette.join('|'))) {
      continue;
    }
    next.push(palette);
    if (next.length >= maxCount) {
      break;
    }
  }
  return next;
}

function normalizeRandomHistory(input: unknown): WorkspaceSurfaceRandomHistory {
  return normalizePaletteCollection(input, WORKSPACE_SURFACE_RANDOM_HISTORY_LIMIT);
}

function normalizeFavorites(input: unknown): WorkspaceSurfaceFavorites {
  return normalizePaletteCollection(input);
}

export function getWorkspaceSurfaceRandomHistory(mode: WorkspaceSurfaceColorMode = 'light') {
  return normalizeRandomHistory(parseStoredJson(getModeStorageKeys(mode).randomHistory));
}

function setWorkspaceSurfaceRandomHistory(value: WorkspaceSurfaceRandomHistory, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    getModeStorageKeys(mode).randomHistory,
    JSON.stringify(normalizeRandomHistory(value))
  );
}

export function pushWorkspaceSurfaceRandomHistoryEntry(palette: string[], mode: WorkspaceSurfaceColorMode = 'light') {
  const normalizedPalette = normalizeStoredPalette(palette);
  if (!normalizedPalette) {
    return getWorkspaceSurfaceRandomHistory(mode);
  }
  const nextHistory = normalizeRandomHistory([normalizedPalette, ...getWorkspaceSurfaceRandomHistory(mode)]);
  setWorkspaceSurfaceRandomHistory(nextHistory, mode);
  return nextHistory;
}

export function getWorkspaceSurfaceFavorites(mode: WorkspaceSurfaceColorMode = 'light') {
  return normalizeFavorites(parseStoredJson(getModeStorageKeys(mode).favorites));
}

function setWorkspaceSurfaceFavorites(value: WorkspaceSurfaceFavorites, mode: WorkspaceSurfaceColorMode = 'light') {
  setWhitelistedLocalStorageItem(
    getModeStorageKeys(mode).favorites,
    JSON.stringify(normalizeFavorites(value))
  );
}

export function addWorkspaceSurfaceFavorite(palette: string[], mode: WorkspaceSurfaceColorMode = 'light') {
  const normalizedPalette = normalizeStoredPalette(palette);
  if (!normalizedPalette) {
    return getWorkspaceSurfaceFavorites(mode);
  }
  const nextFavorites = normalizeFavorites([normalizedPalette, ...getWorkspaceSurfaceFavorites(mode)]);
  setWorkspaceSurfaceFavorites(nextFavorites, mode);
  return nextFavorites;
}

export function removeWorkspaceSurfaceFavorite(palette: string[], mode: WorkspaceSurfaceColorMode = 'light') {
  const paletteSignature = palette.map((color) => color.toLowerCase()).join('|');
  const nextFavorites = getWorkspaceSurfaceFavorites(mode).filter((entry) => entry.map((color) => color.toLowerCase()).join('|') !== paletteSignature);
  setWorkspaceSurfaceFavorites(nextFavorites, mode);
  return nextFavorites;
}
