// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-naming-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { runPreparedImport } from './importPipeline.js';
import { readInboxChildTitlesByOrder } from './importPipeline.test-support.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-naming-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createUntrackedImport(content: string, importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    degradedReason: null,
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    importedAt,
    kind: 'markdown',
    sourceTrackingMode: 'untracked'
  });
}

it('auto-renames manual duplicate imports so inbox titles stay unique', () => {
  const first = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  const second = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));
  const third = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:10:00.000Z'));

  expect(first.nodeId).not.toBe(second.nodeId);
  expect(second.nodeId).not.toBe(third.nodeId);
  expect(readInboxChildTitlesByOrder()).toEqual([
    { title: 'Imported 3' },
    { title: 'Imported 2' },
    { title: 'Imported' }
  ]);
});
