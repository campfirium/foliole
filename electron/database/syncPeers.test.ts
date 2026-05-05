// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-peers-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncPeers, saveSyncPeers } from './syncPeers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-peers-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists sync peers and normalizes invalid rows', () => {
  const saved = saveSyncPeers([
    {
      peer_id: 'android-1',
      status: 'paired',
      last_synced_at: '2026-04-21T16:30:00.000Z',
      last_seen_version_cursor: 'desktop-1#42'
    },
    {
      peer_id: '  ',
      status: 'revoked',
      last_synced_at: null,
      last_seen_version_cursor: null
    }
  ]);

  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    peer_id: 'android-1',
    status: 'paired',
    last_synced_at: '2026-04-21T16:30:00.000Z',
    last_seen_version_cursor: 'desktop-1#42'
  });
  expect(saved[0]?.updated_at).toMatch(/T/);
  expect(loadSyncPeers()).toEqual(saved);
});

it('replaces removed peers on save', () => {
  saveSyncPeers([
    {
      peer_id: 'android-1',
      status: 'paired',
      last_synced_at: null,
      last_seen_version_cursor: null
    },
    {
      peer_id: 'android-2',
      status: 'stale',
      last_synced_at: null,
      last_seen_version_cursor: 'desktop-1#9'
    }
  ]);

  const saved = saveSyncPeers([
    {
      peer_id: 'android-2',
      status: 'revoked',
      last_synced_at: '2026-04-21T16:40:00.000Z',
      last_seen_version_cursor: 'desktop-1#12'
    }
  ]);

  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    peer_id: 'android-2',
    status: 'revoked',
    last_synced_at: '2026-04-21T16:40:00.000Z',
    last_seen_version_cursor: 'desktop-1#12'
  });
});
