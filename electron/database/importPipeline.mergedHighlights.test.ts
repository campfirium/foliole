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

import { buildNodeBodyContentSql } from '../../lib/core/database/nodeBodySql.js';
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
    ? connection.sqlite.prepare(`SELECT n.parent_id, n.title, ${buildNodeBodyContentSql()} AS content
      FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash WHERE n.id = ?`).get(nodeId)
    : undefined;
  const childRows = nodeId
    ? connection.sqlite
        .prepare(`SELECT n.id, n.parent_id, n.title, ${buildNodeBodyContentSql()} AS content, n.anchor_link, n.deleted_at
          FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash=n.body_blob_hash
          WHERE n.parent_id = ? ORDER BY n.id`)
        .all(nodeId) as Array<{ id: string; anchor_link: string; content: string; parent_id: string; title: string; deleted_at: string | null }>
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

it('retains omitted highlight identities and adds exact new highlights without duplication on merged reimport', () => {
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
  const firstChildren = readPersistedImportState(first.sourceFingerprint, first.nodeId).childRows;
  expect(firstChildren).toHaveLength(1);
  const previous = firstChildren.find(row => row.content === 'important');
  if (!previous) throw new Error('missing_original_highlight');
  const originalAnchor = parseAnchorLink(previous.anchor_link);
  const updatedInput = createPreparedDesktopTextImport({
    content: '# Imported\nUse ==different== text',
    fileName: 'note.md',
    filePath: '/tmp/note.md',
    highlightPolicy: 'adopt',
    importedAt: '2026-03-22T10:30:00.000Z',
    kind: 'markdown'
  });
  const updated = runPreparedImport(updatedInput);
  expect(updated.nodeId).toBe(first.nodeId);
  expect(updated.sourceFingerprint).toBe(first.sourceFingerprint);

  const { childRows, nodeRow } = readPersistedImportState(first.sourceFingerprint, updated.nodeId);
  const parentContent = '# Imported\nUse different text';
  expect(nodeRow).toEqual({
    content: parentContent,
    parent_id: 'special-inbox',
    title: 'Imported'
  });
  expect(childRows).toHaveLength(2);
  const retained = childRows.find(row => row.id === previous.id);
  expect(retained).toMatchObject({ id: previous.id, content: 'important', title: 'important',
    parent_id: updated.nodeId, deleted_at: null });
  if (!retained) throw new Error('missing_retained_highlight');
  expect(parseAnchorLink(retained.anchor_link)).toMatchObject({ id: originalAnchor.id, kind: originalAnchor.kind });
  expect(parseAnchorLink(retained.anchor_link)).not.toHaveProperty('locator');
  const added = childRows.find(row => row.id !== previous.id);
  expect(added).toMatchObject({ content: 'different', title: 'different', parent_id: updated.nodeId, deleted_at: null });
  if (!added) throw new Error('missing_new_highlight');
  const addedAnchor = parseAnchorLink(added.anchor_link);
  expect(addedAnchor.id).not.toBe(originalAnchor.id);
  const from = parentContent.indexOf('different');
  expect(addedAnchor.locator).toEqual({ from, to: from + 'different'.length, originalText: 'different' });
  expect(parentContent.slice(addedAnchor.locator?.from, addedAnchor.locator?.to)).toBe('different');
  const repeated = runPreparedImport(updatedInput);
  expect(repeated.nodeId).toBe(updated.nodeId);
  expect(repeated.sourceFingerprint).toBe(first.sourceFingerprint);
  const repeatedChildren = readPersistedImportState(first.sourceFingerprint, repeated.nodeId).childRows;
  expect(Object.fromEntries(repeatedChildren.map(row => [row.id, row])))
    .toEqual(Object.fromEntries(childRows.map(row => [row.id, row])));
});

it('keeps merged child text from the highlight file while anchoring only the exact parent text', () => {
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
        locator: expect.objectContaining({ originalText: 'This is the highlighted sentence.' })
      }),
      content: 'This is the highlighted sentence.\n※ Reader note',
      parent_id: updated.nodeId,
      title: 'This is the highlighted sentence.'
    }
  ]);
});
