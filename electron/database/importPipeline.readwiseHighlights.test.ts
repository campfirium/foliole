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
    ? (connection.sqlite.prepare('SELECT parent_id, kind, title, content FROM nodes WHERE id = ?').get(nodeId) as
        | { content: string; kind: string; parent_id: string; title: string }
        | undefined)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite
        .prepare('SELECT parent_id, kind, title, content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
        .all(nodeId) as Array<{ anchor_link: string | null; content: string; kind: string; parent_id: string; title: string }>
    : [];

  return { childRows, nodeRow, runRows };
}

function parseAnchorLink(value: string) {
  return JSON.parse(value) as {
    id: string;
    kind: string;
    locator?: { from: number; originalText: string; to: number };
  };
}

function expectReadwiseParentBody(input: {
  childRows: Array<{ anchor_link: string | null; content: string; kind: string; parent_id: string | null; title: string }>;
  nodeRow: { content: string; kind: string; parent_id: string; title: string } | undefined;
}) {
  expect(input.nodeRow).toEqual({
    content: [
      '# Article',
      '',
      'This is the highlighted sentence inside the article body.',
      '',
      'Another paragraph with Another matching excerpt. End.'
    ].join('\n'),
    kind: 'topic',
    parent_id: 'special-inbox',
    title: 'readwise'
  });
}

function expectReadwiseDerivedChildren(input: {
  childRows: Array<{ anchor_link: string | null; content: string; kind: string; parent_id: string | null; title: string }>;
  nodeId: string | null;
}) {
  const firstAnchorLink = parseAnchorLink(input.childRows[0]!.anchor_link ?? '');
  const secondAnchorLink = parseAnchorLink(input.childRows[1]!.anchor_link ?? '');
  expect(input.childRows.map((row) => ({
    anchorLink: row.anchor_link ? parseAnchorLink(row.anchor_link) : null,
    content: row.content,
    kind: row.kind,
    parent_id: row.parent_id,
    title: row.title
  }))).toEqual([
    {
      anchorLink: expect.objectContaining({
        id: firstAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({
          originalText: 'This is the highlighted sentence'
        })
      }),
      content: 'This is the highlighted sentence',
      kind: 'topic',
      parent_id: input.nodeId,
      title: 'This is the highlighted sentence'
    },
    {
      anchorLink: expect.objectContaining({
        id: secondAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({
          originalText: 'Another matching excerpt'
        })
      }),
      content: 'Another matching excerpt\n※ Keep this one',
      kind: 'topic',
      parent_id: input.nodeId,
      title: 'Another matching excerpt'
    },
    {
      anchorLink: null,
      content: 'quote that is not present in the body\n※ Unmatched note',
      kind: 'topic',
      parent_id: input.nodeId,
      title: 'quote that is not present in the body'
    }
  ]);
}

function expectReadwiseImportedState(input: {
  childRows: Array<{ anchor_link: string | null; content: string; kind: string; parent_id: string | null; title: string }>;
  nodeId: string | null;
  nodeRow: { content: string; kind: string; parent_id: string; title: string } | undefined;
  runRows: unknown;
}) {
  expectReadwiseParentBody(input);
  expectReadwiseDerivedChildren(input);
  expect(input.runRows).toEqual([
    {
      degraded_reason: 'Controlled context degraded: 1 unmatched sidecar highlight(s)',
      duplicate_semantic: 'new',
      node_id: input.nodeId,
      result_status: 'degraded'
    }
  ]);
}

function createReadwisePreparedImport() {
  return createPreparedDesktopTextImport({
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
      { label: 'Recovered 2', note: 'Keep this one', text: 'Another matching excerpt' },
      { label: 'Missing', note: 'Unmatched note', text: 'quote that is not present in the body' }
    ],
    importedAt: '2026-03-26T01:00:00.000Z',
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
}

function expectImportedChildrenInSnapshot(nodeId: string, sourceFingerprint: string) {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  expect(snapshot).not.toBeNull();
  if (!snapshot) {
    throw new Error('expected workspace snapshot');
  }
  expect(snapshot.nodesById[nodeId]?.kind).toBe('topic');
  const importedChildren = snapshot.nodeOrder
    .map((childNodeId) => snapshot.nodesById[childNodeId])
    .filter((node) => node?.parentNodeId === nodeId);
  const persistedState = readPersistedImportState(sourceFingerprint, nodeId);
  const firstAnchorLink = parseAnchorLink(persistedState.childRows[0]!.anchor_link ?? '');
  const secondAnchorLink = parseAnchorLink(persistedState.childRows[1]!.anchor_link ?? '');
  expect(importedChildren).toEqual([
    expect.objectContaining({
      kind: 'topic',
      anchorLink: expect.objectContaining({
        id: firstAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'This is the highlighted sentence' })
      })
    }),
    expect.objectContaining({
      kind: 'topic',
      anchorLink: expect.objectContaining({
        id: secondAnchorLink.id,
        kind: 'highlight',
        locator: expect.objectContaining({ originalText: 'Another matching excerpt' })
      })
    }),
    expect.objectContaining({
      kind: 'topic',
      anchorLink: null,
      content: 'quote that is not present in the body\n※ Unmatched note'
    })
  ]);
}

it('creates imported child nodes for matched sidecar highlights during the first import', () => {
  const imported = runPreparedImport(
    createReadwisePreparedImport()
  );

  expectReadwiseImportedState({
    ...(readPersistedImportState(imported.sourceFingerprint, imported.nodeId) as ReturnType<typeof readPersistedImportState>),
    nodeId: imported.nodeId
  });

  expect(imported.nodeId).not.toBeNull();
  if (!imported.nodeId) {
    throw new Error('expected imported node id');
  }
  expectImportedChildrenInSnapshot(imported.nodeId, imported.sourceFingerprint);
});
