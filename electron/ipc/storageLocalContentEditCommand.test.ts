// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-versioned-node-mutation-tests';

vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import {
  upsertVersionedNodeSnapshot
} from '../database/nodeVersionedMutations.js';

vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

import { handleLocalContentEditCommand } from './storageLocalContentEditCommand.js';

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



it('returns the persisted projection and both confirmation identities through the command boundary', async () => {
  upsertVersionedNodeSnapshot(nodeInput('First\nMiddle\nLast\n', '2026-07-25T04:30:00.000Z'));
  const base = openDatabaseConnection().sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('node-1') as { current_version_id: string };
  upsertVersionedNodeSnapshot(nodeInput('First\nMiddle\nRemote last\n', '2026-07-25T04:35:00.000Z'));
  const result = await handleLocalContentEditCommand({
    parent: nodeInput('Local first\nMiddle\nLast\n', '2026-07-25T04:32:00.000Z'),
    affectedAnchors: [],
    edit: { baseVersionId: base.current_version_id, versionId: 'ver_local' }
  }, null) as { nodes: Array<{ content: string }>; contentEdit: { submittedVersionId: string; currentVersionId: string } };
  expect(result.nodes[0]?.content).toBe('Local first\nMiddle\nRemote last\n');
  expect(result.contentEdit.submittedVersionId).toBe('ver_local');
  expect(result.contentEdit.currentVersionId).not.toBe('ver_local');
});

it('rejects malformed edit identities before writing', async () => {
  upsertVersionedNodeSnapshot(nodeInput('Original', '2026-07-25T04:30:00.000Z'));
  await expect(handleLocalContentEditCommand({
    parent: nodeInput('Local', '2026-07-25T04:32:00.000Z'), affectedAnchors: [],
    edit: { baseVersionId: 12, versionId: 'ver_local' }
  }, null)).rejects.toThrow();
  expect(openDatabaseConnection().sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual({ count: 1 });
});

it('preserves the normal anchor remap and retries the same saved version', async () => {
  const original = 'Prefix Target sentence.';
  const content = 'Longer prefix Target sentence.';
  upsertVersionedNodeSnapshot(nodeInput(original, '2026-07-25T04:30:00.000Z'));
  upsertVersionedNodeSnapshot({
    ...nodeInput('Target sentence.', '2026-07-25T04:30:00.000Z'),
    nodeId: 'child', parentNodeId: 'node-1',
    anchorLink: { id: 'anchor', kind: 'highlight', locator: {
      from: original.indexOf('Target'), to: original.length, originalText: 'Target sentence.'
    } }
  });
  const sqlite = openDatabaseConnection().sqlite;
  const base = sqlite.prepare('SELECT current_version_id FROM nodes WHERE id = ?')
    .get('node-1') as { current_version_id: string };
  const request = {
    parent: nodeInput(content, '2026-07-25T04:32:00.000Z'), affectedAnchors: [],
    edit: { baseVersionId: base.current_version_id, versionId: 'ver_normal-edit' }
  };
  await handleLocalContentEditCommand(request, null);
  const count = sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get();
  await handleLocalContentEditCommand(request, null);
  expect(sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions').get()).toEqual(count);
  const row = sqlite.prepare('SELECT anchor_link FROM nodes WHERE id = ?').get('child') as { anchor_link: string };
  expect(JSON.parse(row.anchor_link).locator.from).toBe(content.indexOf('Target'));
});
