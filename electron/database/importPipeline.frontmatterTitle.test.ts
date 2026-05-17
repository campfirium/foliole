// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-frontmatter-title-tests';

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
import { readPersistedImportState } from './importPipeline.test-support.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-frontmatter-title-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('persists external frontmatter titles as internal document titles', () => {
  const imported = runPreparedImport(createPreparedDesktopTextImport({
    content: [
      '---',
      'title: External Article',
      'author: Jane',
      'url: https://example.com/article',
      '---',
      '',
      'Opening paragraph.'
    ].join('\n'),
    fileName: 'saved-page.md',
    filePath: '/tmp/saved-page.md',
    importedAt: '2026-05-17T10:10:00.000Z',
    kind: 'markdown'
  }));

  const { nodeRow } = readPersistedImportState(imported.sourceFingerprint, imported.nodeId);

  expect(nodeRow).toEqual({
    content: [
      '---',
      'author: Jane',
      'url: https://example.com/article',
      '---',
      '',
      '# External Article',
      '',
      'Opening paragraph.'
    ].join('\n'),
    hide_title_heading: 1,
    opening_text: 'Opening paragraph.',
    parent_id: 'special-inbox',
    title: 'External Article'
  });
});
