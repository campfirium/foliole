// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-update-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-readwise-update-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readPersistedImportState(sourceFingerprint: string, nodeId: string | null) {
  const connection = openDatabaseConnection();
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
    ? connection.sqlite
        .prepare('SELECT parent_id, title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
        .all(nodeId)
    : [];

  return { childRows, nodeRow, runRows };
}

function createReadwiseImport(content: string, highlights: string[], importedAt: string) {
  return createPreparedDesktopTextImport({
    content,
    fileName: 'readwise.md',
    filePath: '/tmp/readwise.md',
    highlightSidecar: highlights.map((text) => ({ text })),
    importedAt,
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
}

it('preserves the existing readwise parent body while appending only newly anchored highlights on update', () => {
  const first = runPreparedImport(
    createReadwiseImport(['# Article', '', 'Alpha sentence.', '', 'Beta sentence.'].join('\n'), ['Alpha sentence.'], '2026-03-26T02:00:00.000Z')
  );
  const updated = runPreparedImport(
    createReadwiseImport(
      ['# Article', '', 'Totally replaced upstream body.', '', 'Beta sentence.'].join('\n'),
      ['Alpha sentence.', 'Beta sentence.', 'Gamma missing.'],
      '2026-03-26T02:05:00.000Z'
    )
  );
  const { childRows, nodeRow, runRows } = readPersistedImportState(updated.sourceFingerprint, updated.nodeId);

  expect(updated.nodeId).toBe(first.nodeId);
  expect(nodeRow).toEqual({
    content: [
      '# Article',
      '',
      '<highlight id="1">Alpha sentence.</highlight id="1">',
      '',
      '<highlight id="2">Beta sentence.</highlight id="2">',
      '',
      '## Unmatched Sidecar Highlights',
      '',
      '- Highlight 1: Gamma missing.'
    ].join('\n'),
    parent_id: 'special-inbox',
    title: 'readwise.md'
  });
  expect(childRows).toEqual([
    {
      anchor_link: JSON.stringify({ id: '1', kind: 'highlight' }),
      content: 'Alpha sentence.',
      parent_id: updated.nodeId,
      title: 'Alpha sentence.'
    },
    {
      anchor_link: JSON.stringify({ id: '2', kind: 'highlight' }),
      content: 'Beta sentence.',
      parent_id: updated.nodeId,
      title: 'Beta sentence.'
    }
  ]);
  expect(runRows).toEqual([
    {
      degraded_reason: null,
      duplicate_semantic: 'new',
      node_id: updated.nodeId,
      result_status: 'imported'
    },
    {
      degraded_reason: 'Controlled context degraded: 2 unmatched sidecar highlight(s)',
      duplicate_semantic: 'updated',
      node_id: updated.nodeId,
      result_status: 'degraded'
    }
  ]);
});
