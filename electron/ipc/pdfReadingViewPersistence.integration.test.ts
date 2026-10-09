// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => state.root } }));
vi.mock('../nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: state.root,
    app_config_dir: state.root,
    app_cache_dir: path.join(state.root, 'cache'),
    documents_dir: state.root,
    app_log_dir: path.join(state.root, 'logs')
  })
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import { loadAppSettingsState, saveAppSettingsState } from './storage.js';

afterEach(async () => {
  closeDatabaseConnection();
  if (state.root) await fs.rm(state.root, { recursive: true, force: true });
});
it('retains per-PDF mode and both ranges through renderer setting saves and a cold database reopen', async () => {
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-view-'));
  initializeDatabase();
  const views = JSON.stringify({
    fingerprint: {
      mode: 'manual',
      automatic: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      manual: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }
    }
  });
  await saveAppSettingsState({ 'foliole-pdf-document-views': views });
  await saveAppSettingsState({ 'foliole-settings-active-category': 'appearance' });
  closeDatabaseConnection();
  initializeDatabase();
  expect((await loadAppSettingsState())['foliole-pdf-document-views']).toBe(views);
});
