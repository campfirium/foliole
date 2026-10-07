// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let stateRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: stateRoot, app_cache_dir: path.join(stateRoot, 'cache'),
  app_config_dir: path.join(stateRoot, 'config'), app_log_dir: path.join(stateRoot, 'logs')
}) }));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

beforeEach(async () => {
  stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-order-retention-'));
  initializeDatabase();
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(stateRoot, { recursive: true, force: true });
});

it('releases unneeded arrangement bodies during ordinary local writes without rewriting ancestry', () => {
  const db = openDatabaseConnection().sqlite;
  const seed = (id: string) => upsertNodeSnapshot({ nodeId: id, kind: 'topic', title: id,
    content: 'Body', position: 0, parentNodeId: null, createdAt: '2026-10-07T00:00:00Z',
    updatedAt: '2026-10-07T00:00:00Z', isTitleManual: true, anchorLink: null, reveal: null });
  seed('order-a');
  const first = db.prepare("SELECT * FROM parent_order_versions WHERE kind = 'membership' ORDER BY rowid DESC LIMIT 1").get() as
    { version_id: string; parent_id: string; parent_version_ids_json: string; created_at: string };
  seed('order-b');
  const retired = db.prepare('SELECT * FROM parent_order_versions WHERE version_id = ?').get(first.version_id);
  expect(retired).toMatchObject({ ...first, child_ids_json: 'null' });
  const head = db.prepare(`SELECT version.child_ids_json FROM parent_order_heads head
    JOIN parent_order_versions version ON head.version_id = version.version_id
    WHERE head.parent_id = ?`).pluck().get(first.parent_id) as string;
  expect(JSON.parse(head)).toEqual(expect.arrayContaining(['order-a', 'order-b']));
});
