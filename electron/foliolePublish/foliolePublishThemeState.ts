import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { writeFileAtomic } from './foliolePublishModel.js';

export const FOLIOLE_PUBLISH_THEME_STATE_FILE = '.foliole-theme.json';
export const FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION = 2;

export type FoliolePublishThemeFile = 'archive.html' | 'page.html' | 'site.js' | 'style.css';
export type FoliolePublishThemeHashes = Record<FoliolePublishThemeFile, string>;

export interface FoliolePublishThemeState {
  files: FoliolePublishThemeHashes;
  official_theme_version: number;
  version: 1;
}

const LEGACY_OFFICIAL_THEME_HASHES: FoliolePublishThemeHashes[] = [{
  'archive.html': '5f335f51e38e1366e46030193aa84e8f20bf489f03d08d4d314adb693c7c4a91',
  'page.html': 'f8164c4f6551b820ffda3f0422c9bc7e7088a15ae90c19b17828d1a308434b85',
  'site.js': 'b5c86e07df1544d2264a6b6b289db0049aaff06a4a450ff167a0928310c45905',
  'style.css': 'c3d3fb0942b5c8aa9a55ba79ccbac47ff7f7ff954dd3feab30e8ec9f38168129'
}];

export function hashFoliolePublishTheme(contents: string) {
  return createHash('sha256').update(contents).digest('hex');
}

function isHashes(value: unknown): value is FoliolePublishThemeHashes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const files = value as Record<string, unknown>;
  return ['archive.html', 'page.html', 'site.js', 'style.css']
    .every((name) => typeof files[name] === 'string' && files[name].length > 0);
}

function readThemeState(theme: string): FoliolePublishThemeState | null {
  const statePath = path.join(theme, FOLIOLE_PUBLISH_THEME_STATE_FILE);
  if (!fs.existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<FoliolePublishThemeState>;
    if (parsed.version !== 1 || !Number.isInteger(parsed.official_theme_version) || !isHashes(parsed.files)) return null;
    return parsed as FoliolePublishThemeState;
  } catch { return null; }
}

function closestLegacyBaseline(actual: FoliolePublishThemeHashes) {
  return LEGACY_OFFICIAL_THEME_HASHES
    .map((files) => ({ files, score: Object.keys(files).filter((name) => (
      actual[name as FoliolePublishThemeFile] === files[name as FoliolePublishThemeFile]
    )).length }))
    .sort((left, right) => right.score - left.score)[0];
}

export function planFoliolePublishThemeUpgrade(
  actual: FoliolePublishThemeHashes,
  stored: FoliolePublishThemeState | null
) {
  if (stored && stored.official_theme_version >= FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION) return [];
  const legacy = stored ? null : closestLegacyBaseline(actual);
  const baseline = stored?.files ?? (legacy?.score ? legacy.files : null);
  if (!baseline) return [];
  return Object.keys(actual).filter((name) => (
    actual[name as FoliolePublishThemeFile] === baseline[name as FoliolePublishThemeFile]
  )) as FoliolePublishThemeFile[];
}

function hashesForFiles(files: Record<FoliolePublishThemeFile, string>) {
  return Object.fromEntries(Object.entries(files).map(([name, contents]) => (
    [name, hashFoliolePublishTheme(contents)]
  ))) as FoliolePublishThemeHashes;
}

export function recordFoliolePublishOfficialTheme(
  theme: string,
  files: Record<FoliolePublishThemeFile, string>
) {
  const state: FoliolePublishThemeState = {
    files: hashesForFiles(files),
    official_theme_version: FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION,
    version: 1
  };
  writeFileAtomic(path.join(theme, FOLIOLE_PUBLISH_THEME_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

export function upgradeFoliolePublishOfficialTheme(
  theme: string,
  files: Record<FoliolePublishThemeFile, string>
) {
  const stored = readThemeState(theme);
  if (stored && stored.official_theme_version >= FOLIOLE_PUBLISH_OFFICIAL_THEME_VERSION) return;
  const actual = Object.fromEntries(Object.keys(files).map((name) => [
    name, hashFoliolePublishTheme(fs.readFileSync(path.join(theme, name), 'utf8'))
  ])) as FoliolePublishThemeHashes;
  const replacements = planFoliolePublishThemeUpgrade(actual, stored);
  for (const name of replacements) writeFileAtomic(path.join(theme, name), files[name]);
  recordFoliolePublishOfficialTheme(theme, files);
}
