// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { softDeleteNodes } from '../../lib/core/database/nodeMutations.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { parseAnchorLink, readInboxChildTitlesByOrder, readPersistedImportState } from './importPipeline.test-support.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createImport(content: string, importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    degradedReason: null,
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    importedAt,
    kind: 'markdown'
  });
}

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

it('persists new, duplicate, updated and degraded import semantics with traceability', () => {
  const first = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  const duplicate = runPreparedImport(createImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));
  const updated = runPreparedImport(createImport('# Imported\nUpdated body', '2026-03-22T10:10:00.000Z'));
  const degraded = runPreparedImport(createImport('   \n', '2026-03-22T10:15:00.000Z'));

  const { nodeRow, runRows, sourceRow } = readPersistedImportState(first.sourceFingerprint, first.nodeId);

  expect(first.duplicateSemantic).toBe('new');
  expect(first.resultStatus).toBe('imported');
  expect(first.nodeId).toBeTruthy();

  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(duplicate.resultStatus).toBe('imported');
  expect(duplicate.nodeId).toBe(first.nodeId);

  expect(updated.duplicateSemantic).toBe('updated');
  expect(updated.resultStatus).toBe('imported');
  expect(updated.nodeId).toBe(first.nodeId);

  expect(degraded.duplicateSemantic).toBe('updated');
  expect(degraded.resultStatus).toBe('degraded');
  expect(degraded.degradedReason).toBe('empty_content');
  expect(degraded.nodeId).toBe(first.nodeId);

  expect(sourceRow).toEqual({
    latest_node_id: first.nodeId,
    provider: 'desktop_text_file',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  });
  expect(runRows).toEqual([
    { degraded_reason: null, duplicate_semantic: 'new', node_id: first.nodeId, result_status: 'imported' },
    {
      degraded_reason: null,
      duplicate_semantic: 'duplicate',
      node_id: first.nodeId,
      result_status: 'imported'
    },
    { degraded_reason: null, duplicate_semantic: 'updated', node_id: first.nodeId, result_status: 'imported' },
    {
      degraded_reason: 'empty_content',
      duplicate_semantic: 'updated',
      node_id: first.nodeId,
      result_status: 'degraded'
    }
  ]);
  expect(nodeRow).toEqual({
    content: '# Imported\nUpdated body',
    hide_title_heading: 1,
    opening_text: 'Updated body',
    parent_id: 'special-inbox',
    title: 'note'
  });
});

it('persists explicit degraded reasons while still writing converted content', () => {
  const degraded = runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported\n\n[Table degraded]\nName | Value',
      degradedReason: 'HTML conversion degraded: table',
      fileName: 'note.html',
      filePath: '/tmp/note.html',
      importedAt: '2026-03-22T10:20:00.000Z',
      kind: 'html'
    })
  );

  const { nodeRow, runRows, sourceRow } = readPersistedImportState(degraded.sourceFingerprint, degraded.nodeId);

  expect(degraded.resultStatus).toBe('degraded');
  expect(degraded.degradedReason).toBe('HTML conversion degraded: table');
  expect(sourceRow).toEqual({
    latest_node_id: degraded.nodeId,
    provider: 'desktop_text_file',
    source_kind: 'html',
    source_locator: '/tmp/note.html',
    source_name: 'note.html'
  });
  expect(runRows).toEqual([
    {
      degraded_reason: 'HTML conversion degraded: table',
      duplicate_semantic: 'new',
      node_id: degraded.nodeId,
      result_status: 'degraded'
    }
  ]);
  expect(nodeRow).toEqual({
    content: '# Imported\n\n[Table degraded]\nName | Value',
    hide_title_heading: 1,
    opening_text: '[Table degraded] Name | Value',
    parent_id: 'special-inbox',
    title: 'note'
  });
});

it('adopts markdown highlight markers into Foliole highlight anchors when configured', () => {
  const adopted = runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Imported\nUse ==important== text',
      fileName: 'note.md',
      filePath: '/tmp/note.md',
      highlightPolicy: 'adopt',
      importedAt: '2026-03-22T10:25:00.000Z',
      kind: 'markdown'
    })
  );

  const { childRows, nodeRow } = readPersistedImportState(adopted.sourceFingerprint, adopted.nodeId);
  const importedAnchorLink = parseAnchorLink(childRows[0]!.anchor_link);

  expect(nodeRow).toEqual({
    content: '# Imported\nUse important text',
    hide_title_heading: 1,
    opening_text: 'Use important text',
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
        locator: expect.objectContaining({ originalText: 'important' })
      }),
      content: 'important',
      parent_id: adopted.nodeId,
      title: 'important'
    }
  ]);
});


it('keeps the newest inbox import at the top of inbox children', () => {
  runPreparedImport(createImport('# First\nBody', '2026-03-22T10:00:00.000Z'));
  runPreparedImport(
    createPreparedDesktopTextImport({
      content: '# Second\nBody',
      degradedReason: null,
      fileName: 'second.md',
      filePath: '/tmp/second.md',
      importedAt: '2026-03-22T10:05:00.000Z',
      kind: 'markdown'
    })
  );

  expect(readInboxChildTitlesByOrder()).toEqual([
    { title: 'second' },
    { title: 'note' }
  ]);
});

it('treats untracked imports from the same path as separate inbox items', () => {
  const first = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));
  const second = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));

  expect(first.duplicateSemantic).toBe('new');
  expect(second.duplicateSemantic).toBe('new');
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(second.sourceFingerprint).not.toBe(first.sourceFingerprint);
  expect(readInboxChildTitlesByOrder()).toEqual([{ title: 'note 2' }, { title: 'note' }]);
});

it('lets untracked imports re-enter after the earlier inbox item was deleted', () => {
  const first = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:00:00.000Z'));

  softDeleteNodes(openDatabaseConnection().driver, {
    deletedAt: '2026-03-22T10:01:00.000Z',
    nodeIds: [first.nodeId!]
  });

  const second = runPreparedImport(createUntrackedImport('# Imported\nBody', '2026-03-22T10:05:00.000Z'));
  const connection = openDatabaseConnection();
  const nodeRows = connection.sqlite
    .prepare(`SELECT id, deleted_at FROM nodes WHERE title = 'note' ORDER BY created_at ASC`)
    .all() as Array<{ deleted_at: string | null; id: string }>;

  expect(second.duplicateSemantic).toBe('new');
  expect(second.nodeId).not.toBe(first.nodeId);
  expect(nodeRows).toHaveLength(2);
  expect(nodeRows[0]?.deleted_at).toBe('2026-03-22T10:01:00.000Z');
  expect(nodeRows[1]?.deleted_at).toBeNull();
});
