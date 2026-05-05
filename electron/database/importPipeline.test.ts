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

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
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

function readPersistedImportState(sourceFingerprint: string, nodeId: string | null) {
  const connection = openDatabaseConnection();
  const sourceRow = connection.sqlite
    .prepare(
      `SELECT provider, source_kind, source_name, source_locator, latest_node_id
       FROM import_sources
       WHERE source_fingerprint = ?`
    )
    .get(sourceFingerprint);
  const runRows = connection.sqlite
    .prepare(
      `SELECT duplicate_semantic, result_status, node_id, degraded_reason
       FROM import_runs
       WHERE source_fingerprint = ?
       ORDER BY imported_at ASC`
    )
    .all(sourceFingerprint);
  const nodeRow = nodeId
    ? connection.sqlite.prepare('SELECT parent_id, title, content FROM nodes WHERE id = ?').get(nodeId)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite.prepare('SELECT parent_id, title, content FROM nodes WHERE parent_id = ? ORDER BY created_at ASC').all(nodeId)
    : [];

  return { childRows, nodeRow, runRows, sourceRow };
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
    parent_id: 'special-inbox',
    title: 'note.md'
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
    parent_id: 'special-inbox',
    title: 'note.html'
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

  const { nodeRow } = readPersistedImportState(adopted.sourceFingerprint, adopted.nodeId);

  expect(nodeRow).toEqual({
    content: '# Imported\nUse <highlight id="1">important</highlight id="1"> text',
    parent_id: 'special-inbox',
    title: 'note.md'
  });
});

it('creates imported child nodes for matched sidecar highlights during the first import', () => {
  const imported = runPreparedImport(
    createPreparedDesktopTextImport({
      content: [
        '# Article',
        '',
        'This is the highlighted sentence inside the article body.',
        '',
        'Another paragraph with Another matching excerpt. End.'
      ].join('\n'),
      fileName: 'readwise.md',
      filePath: '/tmp/readwise.md',
      highlightSidecar: [
        { label: 'Recovered 1', text: 'This is the highlighted sentence' },
        { label: 'Recovered 2', text: 'Another matching excerpt' },
        { label: 'Missing', text: 'quote that is not present in the body' }
      ],
      importedAt: '2026-03-26T01:00:00.000Z',
      kind: 'markdown',
      sourceProfile: 'body_with_highlight_sidecar'
    })
  );

  const { childRows, nodeRow, runRows } = readPersistedImportState(imported.sourceFingerprint, imported.nodeId);

  expect(nodeRow).toEqual({
    content: [
      '# Article',
      '',
      'This is the highlighted sentence inside the article body.',
      '',
      'Another paragraph with Another matching excerpt. End.',
      '',
      '## Unmatched Sidecar Highlights',
      '',
      '- Missing: quote that is not present in the body'
    ].join('\n'),
    parent_id: 'special-inbox',
    title: 'readwise.md'
  });
  expect(childRows).toEqual([
    {
      content: 'This is the highlighted sentence inside the article body.',
      parent_id: imported.nodeId,
      title: 'This is the highlighted sentence inside the article body.'
    },
    {
      content: 'Another paragraph with Another matching excerpt. End.',
      parent_id: imported.nodeId,
      title: 'Another paragraph with Another matching excerpt. End.'
    }
  ]);
  expect(runRows).toEqual([
    {
      degraded_reason: 'Controlled context degraded: 1 unmatched sidecar highlight(s)',
      duplicate_semantic: 'new',
      node_id: imported.nodeId,
      result_status: 'degraded'
    }
  ]);
});
