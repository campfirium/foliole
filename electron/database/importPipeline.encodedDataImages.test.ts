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

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

function importEncodedImage(dataUrl: string) {
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
  const nodeRow = openDatabaseConnection().sqlite.prepare(`SELECT ${buildNodeBodyContentSql('nodes')} AS content FROM nodes LEFT JOIN content_blob_data cbd ON cbd.hash = nodes.body_blob_hash WHERE nodes.id = ?`).get(imported.nodeId as string) as { content: string };
  return { status: imported.resultStatus, content: nodeRow.content };
}

it('turns an encoded data-url markdown image into an attachment', () => {
  const { status, content } = importEncodedImage(`data:image/png;base64,${PNG.toString('base64')}`);

  expect(status).toBe('imported');
  expect(content).toMatch(/^!\[Inline\]\(asset:\/\/[0-9a-f]{64}\.png\)$/);
});

it('keeps an unreadable encoded data-url image inline instead of resolving it as a local file', () => {
  const dataUrl = 'data:image/png;base64,cG5n';
  const { status, content } = importEncodedImage(dataUrl);

  expect(status).toBe('degraded');
  expect(content).toBe(`![Inline](${dataUrl})`);
});
