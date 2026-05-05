// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-window-state-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { loadWindowState, saveWindowState } from './windowState.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-window-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists and loads maximized window state', async () => {
  const window = {
    getBounds: () => ({
      x: 120,
      y: 80,
      width: 1500,
      height: 980
    }),
    isMaximized: () => true
  };

  await saveWindowState(window as never);
  await expect(loadWindowState()).resolves.toEqual({
    x: 120,
    y: 80,
    width: 1500,
    height: 980,
    isMaximized: true
  });
});

it('returns null for malformed payload', async () => {
  const statePath = path.join(mockedAppDataDir, 'settings', 'window-state.json');
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    JSON.stringify({
      width: '1400',
      height: 900,
      isMaximized: true
    }),
    'utf8'
  );

  await expect(loadWindowState()).resolves.toBeNull();
});

