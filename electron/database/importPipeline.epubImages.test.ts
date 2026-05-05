// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-epub-images-tests';

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

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-epub-images-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('keeps epub text visible, skips embedded image attachments, and replaces them with explicit fallback text', () => {
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: [
        '# Chapter 1',
        '',
        'Intro paragraph before the image.',
        '',
        '![Cover](OPS/images/cover.png)',
        '![Remote](https://example.com/remote.png)',
        '',
        'Outro paragraph after the image.'
      ].join('\n'),
      fileName: 'book.epub',
      filePath: '/tmp/book.epub',
      importedAt: '2026-03-29T12:00:00.000Z',
      kind: 'epub',
      sourceProfile: 'epub'
    })
  );

  const nodeId = imported.nodeId as string;
  const database = openDatabaseConnection().sqlite;
  const nodeRow = database.prepare('SELECT content FROM nodes WHERE id = ?').get(nodeId) as { content: string };
  const persistedRun = database
    .prepare('SELECT result_status, degraded_reason FROM import_runs WHERE id = ?')
    .get(imported.importId) as { degraded_reason: string | null; result_status: string };
  const attachmentCount = (
    database.prepare('SELECT COUNT(*) AS count FROM attachments').get() as { count: number }
  ).count;
  const attachmentLinkCount = (
    database.prepare('SELECT COUNT(*) AS count FROM node_attachments').get() as { count: number }
  ).count;

  expect(imported.resultStatus).toBe('degraded');
  expect(imported.degradedReason).toBe('EPUB embedded resources not imported yet: OPS/images/cover.png');
  expect(persistedRun).toEqual({
    degraded_reason: 'EPUB embedded resources not imported yet: OPS/images/cover.png',
    result_status: 'degraded'
  });
  expect(nodeRow.content).toContain('Intro paragraph before the image.');
  expect(nodeRow.content).toContain('[EPUB image not imported: Cover (OPS/images/cover.png)]');
  expect(nodeRow.content).toContain('![Remote](https://example.com/remote.png)');
  expect(nodeRow.content).toContain('Outro paragraph after the image.');
  expect(nodeRow.content).not.toContain('![Cover](OPS/images/cover.png)');
  expect(nodeRow.content).not.toContain('asset://');
  expect(attachmentCount).toBe(0);
  expect(attachmentLinkCount).toBe(0);
});
