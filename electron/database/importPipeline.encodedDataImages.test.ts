// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-encoded-data-images-tests';
let tempRoot = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `foliole-import-encoded-data-images-${randomUUID()}-`));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('normalizes encoded data-url markdown images instead of resolving them as local files', () => {
  const dataUrl = 'data:image/png;base64,cG5n';
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: `![Inline](${encodeURIComponent(dataUrl)})`,
      degradedReason: null,
      fileName: 'encoded-data-url.md',
      filePath: 'D:\\X\\Dropbox\\obs\\clip\\Full Document Contents\\Articles\\encoded-data-url.md',
      importedAt: '2026-05-19T10:10:00.000Z',
      kind: 'markdown'
    })
  );

  const nodeRow = openDatabaseConnection().sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get(imported.nodeId as string) as { content: string };
  expect(imported.resultStatus).toBe('imported');
  expect(nodeRow.content).toBe(`![Inline](${dataUrl})`);
  expect(nodeRow.content).not.toContain('Unsupported local image');
});
