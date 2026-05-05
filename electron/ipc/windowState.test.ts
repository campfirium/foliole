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

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadWindowState, saveWindowState } from './windowState.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-window-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists and loads maximized window state', async () => {
  const window = {
    getBounds: () => ({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    }),
    getNormalBounds: () => ({
      x: 120,
      y: 80,
      width: 1500,
      height: 980
    }),
    isMaximized: () => true,
    isFullScreen: () => false
  };

  await saveWindowState(window as never);
  await expect(loadWindowState()).resolves.toEqual({
    x: 120,
    y: 80,
    width: 1500,
    height: 980,
    isMaximized: true,
    isFullScreen: false
  });
});

it('persists and loads fullscreen window state using normal bounds', async () => {
  const window = {
    getBounds: () => ({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    }),
    getNormalBounds: () => ({
      x: 160,
      y: 90,
      width: 1440,
      height: 920
    }),
    isMaximized: () => false,
    isFullScreen: () => true
  };

  await saveWindowState(window as never);
  await expect(loadWindowState()).resolves.toEqual({
    x: 160,
    y: 90,
    width: 1440,
    height: 920,
    isMaximized: false,
    isFullScreen: true
  });
});

it('returns null for malformed payload', async () => {
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(
      'window_state',
      JSON.stringify({
        width: '1400',
        height: 900,
        isMaximized: true
      }),
      '2026-03-06T00:00:00.000Z'
    );

  await expect(loadWindowState()).resolves.toBeNull();
});
