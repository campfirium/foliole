// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appData, app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';

import { resolveArticleIdsForSubtrees, resolveArticleIdsFromNodeId } from './mirrorArticleResolver.js';

let root = '';
const anchorLink = { id: 'a', kind: 'highlight' as const, locator: { from: 0, to: 4, originalText: 'Body' } };

function save(nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic' | 'item', extra: Partial<Parameters<typeof upsertNodeSnapshot>[0]> = {}) {
  upsertNodeSnapshot({ nodeId, parentNodeId, kind, title: nodeId, isTitleManual: true, content: 'Body', reveal: null,
    anchorLink: null, position: 0, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z', ...extra });
}

function perNode(rootIds: string[]) {
  const subtree = openDatabaseConnection().sqlite.prepare(`WITH RECURSIVE subtree AS (
    SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id) SELECT id FROM subtree`)
    .pluck().all(JSON.stringify(rootIds)) as string[];
  return new Set(subtree.flatMap(resolveArticleIdsFromNodeId));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-mirror-subtrees-'));
  appData = path.join(root, 'app-data');
  initializeDatabase();
  save('outer', null, 'folder');
  save('inner', 'outer', 'folder');
  save('deep', 'inner', 'folder');
  save('t1', 'outer', 'topic');
  save('t2', 'inner', 'topic');
  save('t3', 'deep', 'topic');
  save('t1-highlight', 't1', 'item', { anchorLink });
  save('t1-child', 't1', 'topic', { anchorLink });
  save('manual', 'inner', 'item');
  save('t2-note', 't2', 'item');
  save('other', null, 'folder');
  save('t4', 'other', 'topic');
  openDatabaseConnection().sqlite.prepare("UPDATE nodes SET deleted_at = '2026-10-07T00:00:00.000Z' WHERE id = 't3'").run();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it.each([
  [['outer']], [['inner']], [['t1']], [['t1-highlight', 't1-child']], [['manual', 't2-note']], [['deep']],
  [['inner', 't4']], [['t2', 'other']]
])('resolves the same article ids as per-node resolution for the subtrees of %j', (rootIds) => {
  expect(resolveArticleIdsForSubtrees(rootIds)).toEqual(perNode(rootIds));
});
