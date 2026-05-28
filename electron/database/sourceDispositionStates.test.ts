// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-source-disposition-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { restoreSourceDispositions } from './sourceDispositionRestore.js';
import {
  listSourceDispositionRecords,
  mergeImportedSourceDispositionRecords,
  mergeSourceDispositionRecords,
  resetSourceDispositions,
  summarizeSourceDispositions
} from './sourceDispositionStates.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-source-disposition-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedTopic(nodeId: string, title = nodeId) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: `# ${title}`,
    createdAt: '2026-05-19T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId,
    parentNodeId: null,
    position: 0,
    reveal: null,
    title,
    updatedAt: '2026-05-19T00:00:00.000Z'
  });
}

function seedImportItem(nodeId: string, sourcePath: string, title: string) {
  openDatabaseConnection().sqlite.prepare(
    `INSERT OR REPLACE INTO keep_import_items (
       rule_id, source_path, source_mtime_ms, source_size_bytes,
       source_state, local_node_state, has_source_update, last_node_id,
       last_status, first_seen_at, last_seen_at, deleted_at, last_imported_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'keep-rule',
    sourcePath,
    1,
    2,
    'present',
    'active',
    0,
    nodeId,
    'imported',
    '2026-05-19T00:00:00.000Z',
    '2026-05-19T00:00:00.000Z',
    null,
    '2026-05-19T00:00:00.000Z'
  );
  openDatabaseConnection().sqlite.prepare(
    `INSERT OR REPLACE INTO keep_import_item_cache (
       rule_id, source_path, title, content, content_preview,
       source_mtime_ms, source_size_bytes, refreshed_at, refresh_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'keep-rule',
    sourcePath,
    title,
    `# ${title}`,
    title,
    1,
    2,
    '2026-05-19T00:00:00.000Z',
    null
  );
}

it('keeps only exception source states and clears them when topics are restored', () => {
  seedTopic('node-soft', 'Saved Article');
  seedImportItem('node-soft', 'Articles/Saved Article.md', 'Saved Article');

  softDeleteNodes({ deletedAt: '2026-05-19T01:00:00.000Z', nodeIds: ['node-soft'] });

  expect(summarizeSourceDispositions()).toEqual({
    recordCount: 1,
    sizeBytes: expect.any(Number)
  });

  restoreNodes({ nodeIds: ['node-soft'] });

  expect(summarizeSourceDispositions()).toEqual({ recordCount: 0, sizeBytes: 0 });
});

it('restores saved source states to active re-imported topics and supports reset', () => {
  seedTopic('node-old-dismissed', 'Dismissed Article');
  seedImportItem('node-old-dismissed', 'Articles/Dismissed.md', 'Dismissed Article');
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Dismissed Article',
    createdAt: '2026-05-19T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-old-dismissed',
    parentNodeId: null,
    position: 0,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-05-19T01:00:00.000Z',
      nextAt: '2026-05-19T01:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    reveal: null,
    title: 'Dismissed Article',
    updatedAt: '2026-05-19T01:00:00.000Z'
  });

  seedTopic('node-old-deleted', 'Deleted Article');
  seedImportItem('node-old-deleted', 'Articles/Deleted.md', 'Deleted Article');
  deleteNodesPermanently({ nodeIds: ['node-old-deleted'], nodeOrder: [] });

  seedTopic('node-new-dismissed', 'Dismissed Article');
  seedImportItem('node-new-dismissed', 'Articles/Dismissed.md', 'Dismissed Article');
  seedTopic('node-new-deleted', 'Deleted Article');
  seedImportItem('node-new-deleted', 'Articles/Deleted.md', 'Deleted Article');

  expect(restoreSourceDispositions()).toEqual({ dismissedCount: 1, trashedCount: 1 });
  expect(
    openDatabaseConnection().sqlite.prepare('SELECT state FROM node_reading WHERE node_id = ?').get('node-new-dismissed')
  ).toEqual({ state: 'dismissed' });
  expect(
    openDatabaseConnection().sqlite.prepare('SELECT deleted_at FROM nodes WHERE id = ?').get('node-new-deleted')
  ).toEqual({ deleted_at: expect.any(String) });

  expect(resetSourceDispositions()).toEqual({ recordCount: 0, sizeBytes: 0 });
});

it('exports source disposition records and merges imported records', () => {
  seedTopic('node-dismissed', 'Dismissed Article');
  seedImportItem('node-dismissed', 'Articles/Dismissed.md', 'Dismissed Article');
  upsertNodeSnapshot({
    anchorLink: null,
    content: '# Dismissed Article',
    createdAt: '2026-05-19T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-dismissed',
    parentNodeId: null,
    position: 0,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-05-19T01:00:00.000Z',
      nextAt: '2026-05-19T01:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    reveal: null,
    title: 'Dismissed Article',
    updatedAt: '2026-05-19T01:00:00.000Z'
  });

  expect(listSourceDispositionRecords()).toEqual([
    {
      disposition: 'dismissed',
      originalTitle: 'Dismissed Article',
      sourceKind: 'keep',
      sourceScope: 'keep-rule:Articles',
      updatedAt: '2026-05-19T01:00:00.000Z'
    }
  ]);

  expect(
    mergeSourceDispositionRecords([
      {
        disposition: 'soft_deleted',
        originalTitle: 'Deleted Article',
        sourceKind: 'readwise',
        sourceScope: 'readwise-rule:Articles',
        updatedAt: '2026-05-20T01:00:00.000Z'
      }
    ])
  ).toEqual({ recordCount: 2, sizeBytes: expect.any(Number) });
});

it('merges imported source states by current source kind and title', () => {
  seedTopic('node-imported-dismissed', 'Imported Dismissed');
  seedImportItem('node-imported-dismissed', 'New/Imported Dismissed.md', 'Imported Dismissed');
  seedTopic('node-imported-deleted', 'Imported Deleted');
  seedImportItem('node-imported-deleted', 'New/Imported Deleted.md', 'Imported Deleted');

  expect(
    mergeImportedSourceDispositionRecords([
      {
        disposition: 'dismissed',
        originalTitle: 'Imported Dismissed',
        sourceKind: 'keep'
      },
      {
        disposition: 'soft_deleted',
        originalTitle: 'Imported Deleted',
        sourceKind: 'keep'
      },
      {
        disposition: 'dismissed',
        originalTitle: 'Missing Title',
        sourceKind: 'keep'
      }
    ])
  ).toEqual({
    importedCount: 2,
    summary: { recordCount: 2, sizeBytes: expect.any(Number) }
  });
});
