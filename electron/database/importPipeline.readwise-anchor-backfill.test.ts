// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-import-pipeline-readwise-anchor-backfill-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-anchor-backfill-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createReadwiseImport(importedAt: string) {
  return createPreparedDesktopTextImport({
    content: ['# Article', '', '1. Alpha step.', '', '2. Beta step.'].join('\n'),
    fileName: 'readwise.md',
    filePath: '/tmp/readwise.md',
    highlightSidecar: [{ text: ['1. Alpha step.', '  2. Beta step.'].join('\n') }],
    importedAt,
    kind: 'markdown',
    sourceProfile: 'body_with_highlight_sidecar'
  });
}

function simulateLegacyUnmatchedImport(prepared: PreparedImportRecord): PreparedImportRecord {
  return {
    ...prepared,
    degradedReason: 'Controlled context degraded: no sidecar highlights matched source body',
    matchedHighlights: [],
    unmatchedHighlights: (prepared.matchedHighlights ?? []).map((highlight) => ({
      content: highlight.content,
      label: highlight.label,
      locatorText: null
    }))
  };
}

function readChildRows(parentNodeId: string | null) {
  if (!parentNodeId) {
    return [];
  }
  return openDatabaseConnection().sqlite
    .prepare('SELECT content, anchor_link FROM nodes WHERE parent_id = ? ORDER BY created_at ASC')
    .all(parentNodeId) as Array<{ anchor_link: string | null; content: string }>;
}

it('backfills an existing readwise highlight child when a duplicate import can now anchor it', () => {
  const prepared = createReadwiseImport('2026-05-13T10:00:00.000Z');
  const first = runPreparedImport(simulateLegacyUnmatchedImport(prepared));
  expect(readChildRows(first.nodeId)).toEqual([
    {
      anchor_link: null,
      content: ['1. Alpha step.', '  2. Beta step.'].join('\n')
    }
  ]);

  const duplicate = runPreparedImport({
    ...prepared,
    importedAt: '2026-05-13T10:05:00.000Z'
  });
  const childRows = readChildRows(duplicate.nodeId);

  expect(duplicate.duplicateSemantic).toBe('duplicate');
  expect(childRows).toHaveLength(1);
  expect(JSON.parse(childRows[0]!.anchor_link ?? '{}')).toMatchObject({
    kind: 'highlight',
    locator: { originalText: '1. Alpha step.\n\n2. Beta step.' },
    origin: 'imported'
  });
});
