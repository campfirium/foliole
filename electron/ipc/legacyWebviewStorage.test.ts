// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  migrateLegacyWebviewStorage,
  resolveLegacyWebviewProfileCandidates
} from './legacyWebviewStorage.js';

let tempRoot = '';
let appDataDir = '';
let originalHome = '';
let originalUserProfile = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-webview-migration-'));
  appDataDir = path.join(tempRoot, 'AppData', 'Roaming', 'Foliole');
  originalHome = process.env.HOME ?? '';
  originalUserProfile = process.env.USERPROFILE ?? '';
  process.env.HOME = path.join(tempRoot, 'home');
  process.env.USERPROFILE = process.env.HOME;
  await fs.mkdir(process.env.HOME, { recursive: true });
});

afterEach(async () => {
  process.env.HOME = originalHome;
  process.env.USERPROFILE = originalUserProfile;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function resolveCurrentPlatformCandidate() {
  const homeDir = process.platform === 'win32' ? process.env.USERPROFILE ?? '' : process.env.HOME ?? '';
  const [candidate] = resolveLegacyWebviewProfileCandidates(appDataDir, process.platform, homeDir);
  if (!candidate) {
    throw new Error('Missing legacy profile candidate.');
  }
  return candidate;
}

function resolveCurrentPlatformEbWebViewCandidate() {
  const homeDir = process.platform === 'win32' ? process.env.USERPROFILE ?? '' : process.env.HOME ?? '';
  const candidates = resolveLegacyWebviewProfileCandidates(appDataDir, process.platform, homeDir);
  const suffix = path.normalize(path.join('com.foliole.desktop', 'EBWebView'));
  const candidate = candidates.find((item) => item.endsWith(suffix));
  if (!candidate) {
    throw new Error('Missing EBWebView legacy profile candidate.');
  }
  return candidate;
}

it('includes tauri webview-main candidate directory on linux', () => {
  const homeDir = process.env.HOME ?? '';
  const candidates = resolveLegacyWebviewProfileCandidates(appDataDir, 'linux', homeDir);

  expect(candidates).toContain(
    path.join(homeDir, '.local', 'share', 'Foliole', 'Foliole', 'data', 'webview-main')
  );
});

it('copies local storage from legacy profile when target storage is empty', async () => {
  const sourceProfile = resolveCurrentPlatformCandidate();
  const sourceLocalStorage = path.join(sourceProfile, 'Local Storage', 'leveldb');
  await fs.mkdir(sourceLocalStorage, { recursive: true });
  await fs.writeFile(path.join(sourceLocalStorage, '000003.log'), 'foliole-ui-font-preset', 'utf8');

  await migrateLegacyWebviewStorage(appDataDir);

  const targetLogFile = path.join(
    appDataDir,
    'Local Storage',
    'leveldb',
    '000003.log'
  );
  await expect(fs.readFile(targetLogFile, 'utf8')).resolves.toContain('foliole-ui-font-preset');
  await expect(
    fs.readFile(path.join(appDataDir, '.tauri-webview-storage-migrated'), 'utf8')
  ).resolves.toBe(sourceProfile);
});

it('copies local storage from legacy EBWebView Default profile', async () => {
  const sourceProfile = resolveCurrentPlatformEbWebViewCandidate();
  const sourceLocalStorage = path.join(sourceProfile, 'Default', 'Local Storage', 'leveldb');
  await fs.mkdir(sourceLocalStorage, { recursive: true });
  await fs.writeFile(path.join(sourceLocalStorage, '000007.log'), 'foliole-accent-color', 'utf8');

  await migrateLegacyWebviewStorage(appDataDir);

  await expect(
    fs.readFile(
      path.join(appDataDir, 'Local Storage', 'leveldb', '000007.log'),
      'utf8'
    )
  ).resolves.toContain('foliole-accent-color');
  await expect(
    fs.readFile(path.join(appDataDir, '.tauri-webview-storage-migrated'), 'utf8')
  ).resolves.toBe(path.join(sourceProfile, 'Default'));
});

it('does not overwrite existing target local storage', async () => {
  const sourceProfile = resolveCurrentPlatformCandidate();
  const sourceLocalStorage = path.join(sourceProfile, 'Local Storage', 'leveldb');
  await fs.mkdir(sourceLocalStorage, { recursive: true });
  await fs.writeFile(path.join(sourceLocalStorage, '000003.log'), 'legacy', 'utf8');

  const targetLocalStorage = path.join(appDataDir, 'Local Storage', 'leveldb');
  await fs.mkdir(targetLocalStorage, { recursive: true });
  await fs.writeFile(path.join(targetLocalStorage, 'current.log'), 'current', 'utf8');

  await migrateLegacyWebviewStorage(appDataDir);

  await expect(fs.readFile(path.join(targetLocalStorage, 'current.log'), 'utf8')).resolves.toBe('current');
  await expect(fs.access(path.join(targetLocalStorage, '000003.log'))).rejects.toBeTruthy();
});
