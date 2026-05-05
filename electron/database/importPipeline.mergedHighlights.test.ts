// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-merged-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-merged-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readPersistedImportState(sourceFingerprint: string, nodeId: string | null) {
  const connection = openDatabaseConnection();
  const nodeRow = nodeId
    ? connection.sqlite.prepare('SELECT parent_id, title, content FROM nodes WHERE id = ?').get(nodeId)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite
        .prepare('SELECT parent_id, title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
        .all(nodeId)
    : [];
  return { childRows, nodeRow, sourceFingerprint };
}

it('refreshes imported highlight child nodes when a generic merged import changes', () => {
  const first = runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported\nUse ==important== text',
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      highlightPolicy: 'adopt',
      importedAt: '2026-03-22T10:25:00.000Z',
      kind: 'markdown'
    })
  );

  const updated = runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported\nUse ==different== text',
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      highlightPolicy: 'adopt',
      importedAt: '2026-03-22T10:30:00.000Z',
      kind: 'markdown'
    })
  );

  const { childRows, nodeRow } = readPersistedImportState(first.sourceFingerprint, updated.nodeId);

  expect(nodeRow).toEqual({
    content: '# Imported\nUse <highlight id="1">different</highlight id="1"> text',
    parent_id: 'special-inbox',
    title: 'note.md'
  });
  expect(childRows).toEqual([
    {
      anchor_link: JSON.stringify({ id: '1', kind: 'highlight' }),
      content: 'different',
      parent_id: updated.nodeId,
      title: 'different'
    }
  ]);
});
