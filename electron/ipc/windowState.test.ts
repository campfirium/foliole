// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-window-state-tests';

const screenMock = vi.hoisted(() => ({
  getDisplayMatching: vi.fn(() => ({
    workArea: { height: 1040, width: 1920, x: 0, y: 0 }
  })),
  screenToDipRect: vi.fn((_window: unknown, rect: { height: number; width: number; x: number; y: number }) => ({
    height: rect.height / 2,
    width: rect.width / 2,
    x: rect.x / 2,
    y: rect.y / 2
  }))
}));

vi.mock('electron', () => ({
  screen: screenMock
}));

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
  vi.unstubAllGlobals();
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
    isFullScreen: () => false,
    isMinimized: () => false
  };

  await saveWindowState(window as never);
  await expect(loadWindowState()).resolves.toEqual({
    x: 120,
    y: 80,
    width: 1500,
    height: 980,
    isMaximized: true,
    isFullScreen: false,
    coordinateUnit: 'dip'
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
    isFullScreen: () => true,
    isMinimized: () => false
  };

  await saveWindowState(window as never);
  await expect(loadWindowState()).resolves.toEqual({
    x: 160,
    y: 90,
    width: 1440,
    height: 920,
    isMaximized: false,
    isFullScreen: true,
    coordinateUnit: 'dip'
  });
});

it('does not let minimized transition overwrite a maximized preference', async () => {
  await saveWindowState({
    getBounds: () => ({
      x: -7,
      y: -7,
      width: 1934,
      height: 1054
    }),
    getNormalBounds: () => ({
      x: 41,
      y: 0,
      width: 1242,
      height: 811
    }),
    isMaximized: () => true,
    isFullScreen: () => false,
    isMinimized: () => false
  } as never);

  await saveWindowState({
    getBounds: () => ({
      x: 41,
      y: 0,
      width: 1242,
      height: 811
    }),
    getNormalBounds: () => ({
      x: 41,
      y: 0,
      width: 1242,
      height: 811
    }),
    isMaximized: () => false,
    isFullScreen: () => false,
    isMinimized: () => true
  } as never);

  await expect(loadWindowState()).resolves.toEqual({
    x: 41,
    y: 0,
    width: 1242,
    height: 811,
    isMaximized: true,
    isFullScreen: false,
    coordinateUnit: 'dip'
  });
});

it('normalizes legacy physical window state before restore', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  openDatabaseConnection().sqlite
    .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run(
      'window_state',
      JSON.stringify({
        x: -13,
        y: -13,
        width: 3866,
        height: 2106,
        isMaximized: false,
        isFullScreen: false
      }),
      '2026-06-09T00:00:00.000Z'
    );

  await expect(loadWindowState()).resolves.toEqual({
    x: -6,
    y: -6,
    width: 1933,
    height: 1053,
    isMaximized: false,
    isFullScreen: false,
    coordinateUnit: 'dip'
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

it('returns null when startup reads window state before settings schema exists', async () => {
  const dbPath = openDatabaseConnection().dbPath;
  closeDatabaseConnection();
  await fs.rm(dbPath, { force: true });

  await expect(loadWindowState()).resolves.toBeNull();
});
