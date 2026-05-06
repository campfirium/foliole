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
        .all(nodeId) as Array<{ anchor_link: string; content: string; parent_id: string; title: string }>
    : [];
  return { childRows, nodeRow, sourceFingerprint };
}

function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
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
  const importedAnchorLink = parseAnchorLink(childRows[0]!.anchor_link);

  expect(nodeRow).toEqual({
    content: '# Imported\nUse different text',
    parent_id: 'special-inbox',
    title: 'note'
  });
  expect(childRows.map((row) => ({
    anchorLink: parseAnchorLink(row.anchor_link),
    content: row.content,
    parent_id: row.parent_id,
    title: row.title
  }))).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: importedAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'different' })
      }),
      content: 'different',
      parent_id: updated.nodeId,
      title: 'different'
    }
  ]);
});

it('keeps merged child text from the highlight file while storing the matched parent text for location', () => {
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: ['# Imported', '', 'Before the quote. This is the highlighted sentence. After the quote.'].join('\n'),
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      importedAt: '2026-03-22T10:25:00.000Z',
      kind: 'markdown'
    })
  );

  const updated = runPreparedImport(
    createPreparedDesktopTextImport({
      content: ['# Imported', '', 'Before the quote. This is the highlighted sentence. After the quote.'].join('\n'),
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      highlightSidecar: [{ note: 'Reader note', text: 'This is the highlighted sentence.' }],
      importedAt: '2026-03-22T10:30:00.000Z',
      kind: 'markdown',
      sourceProfile: 'body_with_highlight_sidecar'
    })
  );

  const { childRows } = readPersistedImportState(imported.sourceFingerprint, updated.nodeId);
  const importedAnchorLink = parseAnchorLink(childRows[0]!.anchor_link);

  expect(childRows.map((row) => ({
    anchorLink: parseAnchorLink(row.anchor_link),
    content: row.content,
    parent_id: row.parent_id,
    title: row.title
  }))).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: importedAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'Before the quote. This is the highlighted sentence. After the quote.' })
      }),
      content: 'This is the highlighted sentence.\n※ Reader note',
      parent_id: updated.nodeId,
      title: 'This is the highlighted sentence.'
    }
  ]);
});
