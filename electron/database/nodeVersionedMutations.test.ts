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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import {
  upsertVersionedNodeContentWithAnchors,
  upsertVersionedNodeSnapshot,
  upsertVersionedNodeSnapshotWithOrder
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

it('atomically creates a formal sync version and state during a normal node create', () => {
  upsertVersionedNodeSnapshotWithOrder(nodeInput('Alpha baseline.', '2026-07-25T04:31:00.000Z'), ['node-1']);

  const sqlite = openDatabaseConnection().sqlite;
  const node = sqlite.prepare(
    'SELECT current_version_id, sync_dirty FROM nodes WHERE id = ?'
  ).get('node-1') as { current_version_id: string; sync_dirty: number };
  expect(node.current_version_id).toMatch(/^ver_[0-9a-f-]{36}$/);
  expect(node.sync_dirty).toBe(0);
  expect(sqlite.prepare(
    'SELECT body_text FROM node_sync_versions WHERE version_id = ?'
  ).get(node.current_version_id)).toEqual({ body_text: 'Alpha baseline.' });
  expect(sqlite.prepare(
    `SELECT current_version_id, sync_dirty FROM sync_object_state
     WHERE object_type = 'node' AND object_id = ?`
  ).get('node-1')).toEqual({ current_version_id: node.current_version_id, sync_dirty: 0 });
});

it('creates a child version linked to the prior formal version during a normal edit', () => {
  upsertVersionedNodeSnapshot(nodeInput('Alpha baseline.', '2026-07-25T04:31:00.000Z'));
  const sqlite = openDatabaseConnection().sqlite;
  const first = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('node-1') as {
    current_version_id: string;
  };

  upsertVersionedNodeSnapshot(nodeInput('Alpha desktop.', '2026-07-25T04:32:00.000Z'));

  const second = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('node-1') as {
    current_version_id: string;
  };
  expect(second.current_version_id).not.toBe(first.current_version_id);
  expect(sqlite.prepare(
    'SELECT body_text, parent_version_id FROM node_sync_versions WHERE version_id = ?'
  ).get(second.current_version_id)).toEqual({
    body_text: 'Alpha desktop.',
    parent_version_id: first.current_version_id
  });
});

it('remaps persisted anchor children that were not loaded by the renderer', () => {
  const remoteImage = '![Remote](https://example.com/very-long-cover-name.png)';
  const previousContent = `${remoteImage}\n\nTarget sentence.`;
  upsertVersionedNodeSnapshot({
    ...nodeInput(previousContent, '2026-07-25T04:31:00.000Z'),
    nodeId: 'node-parent'
  });
  upsertVersionedNodeSnapshot({
    ...nodeInput('Target sentence.', '2026-07-25T04:31:00.000Z'),
    anchorLink: {
      id: 'anchor-1', kind: 'highlight', locator: {
        from: previousContent.indexOf('Target sentence.'),
        originalText: 'Target sentence.',
        to: previousContent.length
      }
    },
    nodeId: 'node-child',
    parentNodeId: 'node-parent'
  });
  const nextContent = '![Remote](asset://cover.png)\n\nTarget sentence.';

  const updates = upsertVersionedNodeContentWithAnchors({
    ...nodeInput(nextContent, '2026-07-25T04:32:00.000Z'),
    nodeId: 'node-parent'
  }, []);

  expect(updates).toEqual([expect.objectContaining({
    anchorLink: expect.objectContaining({
      locator: {
        from: nextContent.indexOf('Target sentence.'),
        originalText: 'Target sentence.',
        to: nextContent.length
      }
    }),
    nodeId: 'node-child'
  })]);
  const stored = openDatabaseConnection().sqlite
    .prepare('SELECT anchor_link FROM nodes WHERE id = ?')
    .get('node-child') as { anchor_link: string };
  expect(JSON.parse(stored.anchor_link).locator.from).toBe(nextContent.indexOf('Target sentence.'));
});
