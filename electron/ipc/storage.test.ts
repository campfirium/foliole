// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-tests-appdata';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { migrateLegacyWorkspaceState, resolveLegacyWorkspaceCandidatePaths } from './storage.js';

const STORAGE_KEY = 'foliole-workspace-v1';

let tempRoot = '';
let originalHome = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-test-'));
  mockedAppDataDir = path.join(tempRoot, 'config', 'Foliole');
  originalHome = process.env.HOME ?? '';
  process.env.HOME = path.join(tempRoot, 'home');
  await fs.mkdir(process.env.HOME, { recursive: true });
});

afterEach(async () => {
  process.env.HOME = originalHome;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('includes legacy tauri workspace path candidates on linux', () => {
  const homeDir = process.env.HOME ?? '';
  const candidates = resolveLegacyWorkspaceCandidatePaths(STORAGE_KEY, mockedAppDataDir, 'linux', homeDir);

  expect(candidates).toContain(
    path.join(homeDir, '.local', 'share', 'Foliole', 'Foliole', 'data', 'workspace', 'foliole-workspace-v1.json')
  );
});

it('migrates from legacy path when target payload is missing', async () => {
  const homeDir = process.env.HOME ?? '';
  const candidates = resolveLegacyWorkspaceCandidatePaths(STORAGE_KEY, mockedAppDataDir, process.platform, homeDir);
  const sourcePath = candidates[0];
  if (!sourcePath) {
    throw new Error('missing source path candidate');
  }

  const legacyPayload = JSON.stringify({ state: { nodeOrder: ['node-a'] }, version: 0 });
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, legacyPayload, 'utf8');

  await migrateLegacyWorkspaceState(STORAGE_KEY);

  const targetPath = path.join(mockedAppDataDir, 'workspace', 'foliole-workspace-v1.json');
  await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe(legacyPayload);
});

it('picks the richest legacy payload instead of first candidate', async () => {
  const homeDir = process.env.HOME ?? '';
  const candidates = resolveLegacyWorkspaceCandidatePaths(STORAGE_KEY, mockedAppDataDir, process.platform, homeDir);
  const sourcePathA = candidates[0];
  const sourcePathB = candidates[1];
  if (!sourcePathA || !sourcePathB) {
    throw new Error('missing source path candidates');
  }

  const weakPayload = JSON.stringify({
    state: {
      nodesById: { 'node-1': { id: 'node-1', title: 'A' } },
      nodeOrder: ['node-1']
    },
    version: 0
  });
  const richPayload = JSON.stringify({
    state: {
      nodesById: {
        'node-1': { id: 'node-1', title: 'A' },
        'node-2': { id: 'node-2', title: 'B' },
        'node-3': { id: 'node-3', title: 'C' }
      },
      nodeOrder: ['node-1', 'node-2', 'node-3']
    },
    version: 0
  });

  await fs.mkdir(path.dirname(sourcePathA), { recursive: true });
  await fs.mkdir(path.dirname(sourcePathB), { recursive: true });
  await fs.writeFile(sourcePathA, weakPayload, 'utf8');
  await fs.writeFile(sourcePathB, richPayload, 'utf8');

  await migrateLegacyWorkspaceState(STORAGE_KEY);

  const targetPath = path.join(mockedAppDataDir, 'workspace', 'foliole-workspace-v1.json');
  await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe(richPayload);
});

it('does not overwrite existing target payload during migration', async () => {
  const homeDir = process.env.HOME ?? '';
  const candidates = resolveLegacyWorkspaceCandidatePaths(STORAGE_KEY, mockedAppDataDir, process.platform, homeDir);
  const sourcePath = candidates[0];
  if (!sourcePath) {
    throw new Error('missing source path candidate');
  }

  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, JSON.stringify({ state: { nodeOrder: ['legacy'] }, version: 0 }), 'utf8');

  const targetPath = path.join(mockedAppDataDir, 'workspace', 'foliole-workspace-v1.json');
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify({ state: { nodeOrder: ['current'] }, version: 0 }), 'utf8');

  await migrateLegacyWorkspaceState(STORAGE_KEY);

  const currentPayload = await fs.readFile(targetPath, 'utf8');
  expect(currentPayload).toContain('current');
  expect(currentPayload).not.toContain('legacy');
});
