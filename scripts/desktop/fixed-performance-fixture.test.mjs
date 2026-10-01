// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, test } from 'vitest';

import { createBetterSqlite3Driver } from '../../electron/database/betterSqlite3Driver.ts';
import { flushNodeSyncVersionWithDriver } from '../../electron/database/nodeSyncVersionFromDriver.ts';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.ts';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.ts';
import { replaceNodeOrder } from '../../lib/core/database/nodeOrderMutations.ts';
import fixture from './fixed-performance-fixture.cjs';

const services = { createDriver: createBetterSqlite3Driver, upsert: upsertNodeSnapshot,
  flushVersion: flushNodeSyncVersionWithDriver, replaceOrder: replaceNodeOrder };

test('offline fixture persists exact bodies, current versions and order across reopen', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'foliole-benchmark-fixture-'));
  const file = path.join(root, 'fixture.db');
  let db = new Database(file);
  try {
    initializeDatabaseSchema(db);
    db.prepare('ATTACH DATABASE ? AS search').run(path.join(root, 'search.db'));
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('host_name', JSON.stringify('fixture-test'), '2026-10-01T00:00:00.000Z');
    const nodes = Array.from({ length: 1000 }, (_, index) => ({ id: `benchmark-${index}`,
      title: `Sentinel${index}`, content: `正文 ${index}\n**fixed**\n` }));
    fixture.seedFixture(db, services, nodes);
    db.close();
    db = new Database(file);
    const rows = db.prepare(`SELECT n.id, n.title, n.created_at, n.current_version_id,
      v.body_text, v.object_id FROM nodes n JOIN node_sync_versions v
      ON n.current_version_id = v.version_id WHERE n.id LIKE 'benchmark-%'`).all();
    expect(rows).toHaveLength(nodes.length);
    for (const node of nodes) {
      const row = rows.find((value) => value.id === node.id);
      expect(row).toMatchObject({ title: node.title, body_text: node.content, object_id: node.id });
      expect(row.current_version_id).toBeTruthy();
      expect(Number.isFinite(Date.parse(row.created_at))).toBe(true);
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_blob_data').get().count).toBeGreaterThanOrEqual(1000);
    expect(JSON.parse(db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
      .get('parent-child-order:root').child_ids_json).filter((id) => id.startsWith('benchmark-')))
      .toEqual(nodes.map((node) => node.id));
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
}, 120_000);
