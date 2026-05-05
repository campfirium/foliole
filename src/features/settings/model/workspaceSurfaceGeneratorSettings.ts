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

export type WorkspaceSurfaceGeneratorMode = 'automatic' | 'random' | 'manual' | null;
export type WorkspaceSurfaceRandomHistory = string[][];
export type WorkspaceSurfaceFavorites = string[][];

const DEFAULT_AUTO_OPTIONS: WorkspaceSurfaceAutoPaletteOptions = {
  documentPureWhite: false,
  folderTopicSharedTone: false
};

export const DEFAULT_WORKSPACE_SURFACE_AUTO_SEED = '#7a7a7a';
const WORKSPACE_SURFACE_RANDOM_HISTORY_LIMIT = 6;

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

export function getWorkspaceSurfaceRandomHistory() {
  return normalizeRandomHistory(parseStoredJson(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory));
}

export function setWorkspaceSurfaceRandomHistory(value: WorkspaceSurfaceRandomHistory) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceRandomHistory,
    JSON.stringify(normalizeRandomHistory(value))
  );
}

export function pushWorkspaceSurfaceRandomHistoryEntry(palette: string[]) {
  const normalizedPalette = normalizeStoredPalette(palette);
  if (!normalizedPalette) {
    return getWorkspaceSurfaceRandomHistory();
  }
  const nextHistory = normalizeRandomHistory([normalizedPalette, ...getWorkspaceSurfaceRandomHistory()]);
  setWorkspaceSurfaceRandomHistory(nextHistory);
  return nextHistory;
}

export function getWorkspaceSurfaceFavorites() {
  return normalizeFavorites(parseStoredJson(APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites));
}

export function setWorkspaceSurfaceFavorites(value: WorkspaceSurfaceFavorites) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.workspaceSurfaceFavorites,
    JSON.stringify(normalizeFavorites(value))
  );
}

export function addWorkspaceSurfaceFavorite(palette: string[]) {
  const normalizedPalette = normalizeStoredPalette(palette);
  if (!normalizedPalette) {
    return getWorkspaceSurfaceFavorites();
  }
  const nextFavorites = normalizeFavorites([normalizedPalette, ...getWorkspaceSurfaceFavorites()]);
  setWorkspaceSurfaceFavorites(nextFavorites);
  return nextFavorites;
}

export function removeWorkspaceSurfaceFavorite(palette: string[]) {
  const nextFavorites = getWorkspaceSurfaceFavorites().filter((entry) => entry.join('|') !== palette.join('|'));
  setWorkspaceSurfaceFavorites(nextFavorites);
  return nextFavorites;
}
