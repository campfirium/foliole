// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertVersionedNodeContentWithAnchors, upsertVersionedNodeSnapshot,
  upsertVersionedNodeSnapshotWithOrder } from './nodeVersionedMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

const time = '2026-10-08T00:00:00.000Z';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-desktop-versioned-body-'));
  await initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

function input(nodeId: string, content: string) {
  return { nodeId, content, parentNodeId: null, kind: 'topic' as const,
    title: 'Article', isTitleManual: true, position: 0, reveal: null,
    anchorLink: null, createdAt: time, updatedAt: time };
}

it.each([false, true])('writes, versions and remaps an opened article without shared text storage, ordered=%s', async (ordered) => {
  const original = 'Prefix Target sentence.\n' + '\ufeff中😀\0'.repeat(70_000);
  const parent = input('parent', original);
  const first = ordered
    ? upsertVersionedNodeSnapshotWithOrder(parent, ['parent'])
    : upsertVersionedNodeSnapshot(parent);
  if (!first) throw new Error('initial_version_missing');
  await retainLocalEditBase(createBetterSqliteDbPort(openDatabaseConnection().sqlite), {
    holdId: 'editor', nodeId: 'parent', versionId: first
  });
  upsertVersionedNodeSnapshot({ ...input('child', 'Target sentence.'), parentNodeId: 'parent',
    anchorLink: { id: 'anchor', kind: 'highlight', locator: {
      from: original.indexOf('Target'), to: original.indexOf('\n'), originalText: 'Target sentence.'
    } } });
  const next = 'Longer ' + original;
  upsertVersionedNodeContentWithAnchors({ ...parent, content: next }, [],
    { versionId: 'edited-parent' });
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  expect(snapshot?.nodesById.parent?.content).toBe(next);
  expect(snapshot?.nodesById.child?.anchorLink).toMatchObject({ locator: { from: next.indexOf('Target') } });
  const sqlite = openDatabaseConnection().sqlite;
  expect(sqlite.prepare('SELECT count(*) FROM content_blob_data').pluck().get()).toBe(0);
  expect(sqlite.prepare("SELECT content FROM nodes WHERE id = 'parent'").get()).toEqual({ content: next });
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(first)).toBe(original);
  expect(sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get('edited-parent')).toBe(next);
  expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});
