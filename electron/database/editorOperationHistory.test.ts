// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-editor-history-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { loadEditorOperationHistory, saveEditorOperationHistory } from './editorOperationHistory.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-editor-history-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('stores and replaces the local durable history payload', () => {
  expect(loadEditorOperationHistory()).toBeNull();
  saveEditorOperationHistory('{"version":1}');
  expect(loadEditorOperationHistory()).toBe('{"version":1}');
  saveEditorOperationHistory('{"version":1,"next":true}');
  expect(loadEditorOperationHistory()).toBe('{"version":1,"next":true}');
});

it('rejects malformed and oversized payloads without overwriting the last good value', () => {
  saveEditorOperationHistory('{"version":1}');
  expect(() => saveEditorOperationHistory('[]')).toThrow('must be a JSON object');
  expect(() => saveEditorOperationHistory(`{"value":"${'x'.repeat(8 * 1024 * 1024)}"}`))
    .toThrow('exceeds storage limit');
  expect(loadEditorOperationHistory()).toBe('{"version":1}');
});
