// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-versioned-node-mutation-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { retainLocalEditBase, releaseLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  upsertVersionedNodeSnapshot
} from './nodeVersionedMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-versioned-node-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function nodeInput(content: string, updatedAt: string) {
  return {
    anchorLink: null,
    content,
    createdAt: '2026-07-25T04:30:00.000Z',
    isTitleManual: true,
    kind: 'topic' as const,
    nodeId: 'node-1',
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Sync closure',
    updatedAt
  };
}


function currentVersion() {
  return (openDatabaseConnection().sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?')
    .get('node-1') as { current_version_id: string }).current_version_id;
}

function edit(baseVersionId: string, content: string, versionId = 'ver_local-edit') {
  return applyLocalContentEdit(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
    baseVersionId, content, hideTitleHeading: false, hostName: 'local', nodeId: 'node-1',
    title: 'Sync closure', updatedAt: '2026-07-25T04:32:00.000Z', versionId
  });
}

it('merges a delayed edit using its real parent and preserves both branches', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Apples\nBread\nMilk\n', '2026-07-25T04:30:00.000Z'));
  const base = currentVersion();
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    { holdId: 'draft', nodeId: 'node-1', versionId: base });
  upsertVersionedNodeSnapshot(nodeInput('Apples\nBread\nMilk and coffee\n', '2026-07-25T04:35:00.000Z'));
  const remote = currentVersion();
  const result = await edit(base, 'Apples and tea\nBread\nMilk\n');
  expect(result.current.body_text).toBe('Apples and tea\nBread\nMilk and coffee\n');
  expect(result.current.parent_version_ids).toEqual([remote, 'ver_local-edit'].sort());
  const sqlite = openDatabaseConnection().sqlite;
  const originalGraph = () => sqlite.prepare(`SELECT version_id, object_id, parent_version_id,
    host_name, created_at, content_hash, json_remove(snapshot_json, '$.content') AS snapshot_metadata
    FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all('node-1');
  const originalEdges = () => sqlite.prepare(`SELECT version_id, parent_version_id, ordinal
    FROM node_sync_version_parents WHERE version_id IN
      (SELECT version_id FROM node_sync_versions WHERE object_id = ?) ORDER BY version_id, ordinal`)
    .all('node-1');
  expect(originalGraph().map((row) => (row as { version_id: string }).version_id))
    .toEqual([base, remote, 'ver_local-edit', result.current.version_id].sort());
  expect(originalEdges()).toEqual(expect.arrayContaining([
    { version_id: remote, parent_version_id: base, ordinal: 0 },
    { version_id: 'ver_local-edit', parent_version_id: base, ordinal: 0 }
  ]));
  const heldBodies = sqlite.prepare(`SELECT version_id, body_text FROM node_sync_versions
    WHERE version_id IN (?, ?) ORDER BY version_id`).all(base, 'ver_local-edit');
  expect(heldBodies).toEqual([
    { version_id: base, body_text: 'Apples\nBread\nMilk\n' },
    { version_id: 'ver_local-edit', body_text: 'Apples and tea\nBread\nMilk\n' }
  ].sort((left, right) => left.version_id.localeCompare(right.version_id)));
  const graph = originalGraph();
  const edges = originalEdges();
  await releaseLocalEditBase(createBetterSqliteDbPort(sqlite), 'draft', 'node-1');
  expect(originalGraph()).toEqual(graph);
  expect(originalEdges()).toEqual(edges);
  expect(sqlite.prepare(`SELECT version_id, body_text, json_extract(snapshot_json, '$.content') AS content
    FROM node_sync_versions WHERE version_id IN (?, ?, ?) ORDER BY version_id`)
    .all(base, remote, 'ver_local-edit')).toEqual([base, remote, 'ver_local-edit'].sort()
      .map((version_id) => ({ version_id, body_text: null, content: null })));
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?')
    .get(result.current.version_id)).toEqual({ body_text: 'Apples and tea\nBread\nMilk and coffee\n' });
});

it('retains an overlapping edit using the existing alternative policy', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original text', '2026-07-25T04:30:00.000Z'));
  const base = currentVersion();
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    { holdId: 'draft', nodeId: 'node-1', versionId: base });
  upsertVersionedNodeSnapshot(nodeInput('Remote replacement text', '2026-07-25T04:35:00.000Z'));
  const result = await edit(base, 'Local replacement');
  const alternatives = openDatabaseConnection().sqlite.prepare('SELECT body_text FROM node_text_alternatives').all();
  expect([result.current.body_text, ...alternatives.map((row) => (row as { body_text: string }).body_text)].sort())
    .toEqual(['Local replacement', 'Remote replacement text'].sort());
});

it('does not create a version merely because editing was entered', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  const base = currentVersion();
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    { holdId: 'draft', nodeId: 'node-1', versionId: base });
  upsertVersionedNodeSnapshot(nodeInput('Remote', '2026-07-25T04:35:00.000Z'));
  const result = await edit(base, 'Original');
  expect(result.current.body_text).toBe('Remote');
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get())
    .toEqual({ count: 2 });
});

it('retries an acknowledged edit without creating another resolution', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  const base = currentVersion();
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite),
    { holdId: 'draft', nodeId: 'node-1', versionId: base });
  upsertVersionedNodeSnapshot(nodeInput('Remote', '2026-07-25T04:35:00.000Z'));
  const first = await edit(base, 'Local');
  const second = await edit(base, 'Local');
  expect(second.current.version_id).toBe(first.current.version_id);
  await expect(edit(base, 'Different')).rejects.toThrow('content_edit_version_mismatch');
});

it('rejects a missing baseline without changing persisted content', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  const before = currentVersion();
  await expect(edit('ver_missing', 'Local')).rejects.toThrow('content_edit_base_unavailable');
  expect(currentVersion()).toBe(before);
});
