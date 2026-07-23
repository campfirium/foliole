import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { writeFileAtomic } from './foliolePublishModel.js';

export const FOLIOLE_PUBLISH_THEME_STATE_FILE = '.foliole-theme.json';
export const FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION = 5;

export type FoliolePublishThemeFile = 'archive.html' | 'page.html' | 'site.js' | 'style.css';
export type FoliolePublishThemeFiles = Record<FoliolePublishThemeFile, string>;
export type FoliolePublishThemeHashes = Record<FoliolePublishThemeFile, string>;
export type FoliolePublishThemeSelection = 'custom' | 'foliole';

export interface FoliolePublishThemeStatus {
  active_theme: FoliolePublishThemeSelection;
  custom_theme: { based_on_official_version: number | null } | null;
  official_theme_version: number;
}

interface StoredThemeState extends FoliolePublishThemeStatus { version: 2 }
interface LegacyThemeState {
  files: FoliolePublishThemeHashes;
  official_theme_version: number;
  version: 1;
}

const THEME_FILES: FoliolePublishThemeFile[] = ['archive.html', 'page.html', 'site.js', 'style.css'];

export function hashFoliolePublishTheme(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

function isHashes(value: unknown): value is FoliolePublishThemeHashes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const files = value as Record<string, unknown>;
  return THEME_FILES.every((name) => typeof files[name] === 'string' && files[name].length > 0);
}

function parseStoredState(value: unknown): StoredThemeState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Partial<StoredThemeState>;
  const custom = state.custom_theme;
  const customValid = custom === null || (Boolean(custom) && (
    custom?.based_on_official_version === null || Number.isInteger(custom?.based_on_official_version)
  ));
  if (state.version !== 2 || !['custom', 'foliole'].includes(state.active_theme ?? '') ||
    !Number.isInteger(state.official_theme_version) || !customValid ||
    (state.active_theme === 'custom' && !custom)) return null;
  return state as StoredThemeState;
}

function parseLegacyState(file: string): LegacyThemeState | null {
  if (!fs.existsSync(file)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LegacyThemeState>;
    return value.version === 1 && Number.isInteger(value.official_theme_version) && isHashes(value.files)
      ? value as LegacyThemeState
      : null;
  } catch { return null; }
}

function actualHashes(theme: string) {
  if (!THEME_FILES.every((name) => fs.existsSync(path.join(theme, name)))) return null;
  return Object.fromEntries(THEME_FILES.map((name) => [
    name, hashFoliolePublishTheme(fs.readFileSync(path.join(theme, name), 'utf8'))
  ])) as FoliolePublishThemeHashes;
}

function writeThemeState(root: string, status: FoliolePublishThemeStatus) {
  const state: StoredThemeState = { ...status, version: 2 };
  writeFileAtomic(path.join(root, FOLIOLE_PUBLISH_THEME_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
  return status;
}

function migrateLegacyThemeState(root: string): FoliolePublishThemeStatus {
  const theme = path.join(root, 'Theme');
  const actual = fs.existsSync(theme) ? actualHashes(theme) : null;
  const legacy = parseLegacyState(path.join(theme, FOLIOLE_PUBLISH_THEME_STATE_FILE));
  const isUnmodifiedOfficial = Boolean(actual && legacy && THEME_FILES.every((name) => actual[name] === legacy.files[name]));
  if (!fs.existsSync(theme) || isUnmodifiedOfficial) {
    return { active_theme: 'foliole', custom_theme: null, official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION };
  }
  return {
    active_theme: 'custom', custom_theme: { based_on_official_version: null },
    official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
  };
}

export function loadFoliolePublishThemeStatus(root: string) {
  const file = path.join(root, FOLIOLE_PUBLISH_THEME_STATE_FILE);
  if (!fs.existsSync(file)) return writeThemeState(root, migrateLegacyThemeState(root));
  try {
    const state = parseStoredState(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!state) throw new Error('invalid');
    const status = {
      active_theme: state.active_theme, custom_theme: state.custom_theme,
      official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
    } satisfies FoliolePublishThemeStatus;
    return state.official_theme_version === FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
      ? status
      : writeThemeState(root, status);
  } catch {
    throw new Error('Foliole Publish theme selection is unreadable. Restore .foliole-theme.json before publishing again.');
  }
}

export function ensureFoliolePublishCustomTheme(root: string, officialFiles: FoliolePublishThemeFiles) {
  const current = loadFoliolePublishThemeStatus(root);
  const theme = path.join(root, 'Theme');
  if (current.custom_theme) return { path: theme, status: current };
  fs.mkdirSync(theme, { recursive: true });
  for (const name of THEME_FILES) writeFileAtomic(path.join(theme, name), officialFiles[name]);
  return { path: theme, status: writeThemeState(root, {
    ...current,
    custom_theme: { based_on_official_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION },
    official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
  }) };
}

export function activateFoliolePublishCustomTheme(root: string) {
  const current = loadFoliolePublishThemeStatus(root);
  if (!current.custom_theme) throw new Error('Create Custom Theme before selecting it.');
  return writeThemeState(root, { ...current, active_theme: 'custom' });
}

export function activateFoliolePublishOfficialTheme(root: string) {
  const current = loadFoliolePublishThemeStatus(root);
  return writeThemeState(root, {
    ...current, active_theme: 'foliole', official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION
  });
}

export function readFoliolePublishCustomTheme(root: string) {
  const theme = path.join(root, 'Theme');
  const missing = THEME_FILES.filter((name) => !fs.existsSync(path.join(theme, name)));
  if (missing.length > 0) throw new Error(`Custom Theme is missing ${missing.join(', ')}. Open Custom Theme and restore it.`);
  return Object.fromEntries(THEME_FILES.map((name) => [
    name, fs.readFileSync(path.join(theme, name), 'utf8')
  ])) as FoliolePublishThemeFiles;
}
