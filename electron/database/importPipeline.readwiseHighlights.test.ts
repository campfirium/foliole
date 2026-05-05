// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-tests';

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
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-pipeline-readwise-'));
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
    ? connection.sqlite.prepare('SELECT parent_id, kind, title, content FROM nodes WHERE id = ?').get(nodeId)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite
        .prepare('SELECT parent_id, kind, title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
        .all(nodeId)
    : [];

  return { childRows, nodeRow, runRows };
}

function expectReadwiseImportedState(input: {
  childRows: unknown;
  nodeId: string | null;
  nodeRow: unknown;
  runRows: unknown;
}) {
  expect(input.nodeRow).toEqual({
    content: [
      '# Article',
      '',
      '<highlight id="1">This is the highlighted sentence</highlight id="1"> inside the article body.',
      '',
      'Another paragraph with <highlight id="2">Another matching excerpt</highlight id="2">. End.'
    ].join('\n'),
    kind: 'topic',
    parent_id: 'special-inbox',
    title: 'readwise'
  });
  expect(input.childRows).toEqual([
    {
      anchor_link: JSON.stringify({ id: '1', kind: 'highlight' }),
      content: 'This is the highlighted sentence',
      kind: 'topic',
      parent_id: input.nodeId,
      title: 'This is the highlighted sentence'
    },
    {
      anchor_link: JSON.stringify({ id: '2', kind: 'highlight' }),
      content: 'Another matching excerpt',
      kind: 'topic',
      parent_id: input.nodeId,
      title: 'Another matching excerpt'
    }
  ]);
  expect(input.runRows).toEqual([
    {
      degraded_reason: null,
      duplicate_semantic: 'new',
      node_id: input.nodeId,
      result_status: 'imported'
    }
  ]);
}

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

  expectReadwiseImportedState({
    ...readPersistedImportState(imported.sourceFingerprint, imported.nodeId),
    nodeId: imported.nodeId
  });

  expect(imported.nodeId).not.toBeNull();
  if (!imported.nodeId) {
    throw new Error('expected imported node id');
  }

  const snapshot = loadWorkspaceSnapshot();
  expect(snapshot).not.toBeNull();
  if (!snapshot) {
    throw new Error('expected workspace snapshot');
  }
  expect(snapshot.nodesById[imported.nodeId]?.kind).toBe('topic');
  const importedChildren = snapshot.nodeOrder
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node) => node?.parentNodeId === imported.nodeId);
  expect(importedChildren).toEqual([
    expect.objectContaining({ kind: 'topic', anchorLink: { id: '1', kind: 'highlight' } }),
    expect.objectContaining({ kind: 'topic', anchorLink: { id: '2', kind: 'highlight' } })
  ]);
});
