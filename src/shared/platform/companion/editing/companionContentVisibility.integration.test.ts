// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { DbParams, DbPort, DbRow } from '../../../../../lib/core/sync/dbPort';
import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

import { readCompanionContentSource } from './companionContentEditing';
import { insertContentEditNode, openContentEditDatabase } from './companionContentEditing.testSupport';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
  registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));
const now = '2026-10-27T00:00:00.000Z';
let root: string;
let library: Awaited<ReturnType<typeof openContentEditDatabase>>;
beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'foliole-content-visibility-'));
  library = await openContentEditDatabase(root, now);
  state.owner = library.owner;
  await insertContentEditNode(library.owner, { id: 'target', kind: 'topic', title: 'Target', content: 'Keep this body',
    parentNodeId: null, reveal: null, anchorLink: null, isTitleManual: true, hideTitleHeading: false,
    reading: null, review: null, createdAt: now, updatedAt: now }, 'base');
});
afterEach(async () => { await library.owner.close(); library.database.close(); state.owner = null; rmSync(root, { recursive: true, force: true }); });

it('loads the current edit source without scanning unrelated roots in a large library', async () => {
  library.database.prepare(`WITH RECURSIVE ids(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM ids WHERE n < 100000)
    INSERT INTO nodes(id, kind, title, content, created_at, updated_at)
    SELECT 'other-' || n, 'topic', 'Other', '', ?, ? FROM ids`).run(now, now);
  library.database.exec("UPDATE nodes SET parent_id = 'other-1' WHERE id = 'target'");
  const queries: { sql: string; params: DbParams }[] = [];
  let port!: DbPort;
  await library.owner.read(async db => { port = db; });
  const query = port.query.bind(port);
  port.query = async <T extends DbRow>(sql: string, params: DbParams = []) => {
    queries.push({ sql, params });
    return query<T>(sql, params);
  };
  try {
    const source = await readCompanionContentSource('target');
    expect(source.content).toBe('Keep this body');
    expect(source.versionId).toBe('base');
  } finally { port.query = query; }
  // Count real SQLite VM work, independently of host speed, using the exact production reads.
  const measured = spawnSync('python3', ['-c', `
import json, sqlite3, sys, urllib.parse
connection = sqlite3.connect('file:' + urllib.parse.quote(sys.argv[1]) + '?mode=ro', uri=True)
steps = 0
def progress():
    global steps
    steps += 100
    return steps > 10000
connection.set_progress_handler(progress, 100)
for query in json.load(sys.stdin):
    connection.execute(query['sql'], query['params']).fetchall()
print(steps)
`, library.database.name], { input: JSON.stringify(queries), encoding: 'utf8' });
  expect(measured.status, measured.stderr).toBe(0);
  expect(Number(measured.stdout)).toBeLessThanOrEqual(10000);
}, 30000);

it('rejects deleted ancestors, missing ancestors and cycles while allowing a live rooted lineage', async () => {
  const db = library.database;
  db.prepare("INSERT INTO nodes(id, kind, title, content, created_at, updated_at) VALUES ('parent', 'folder', 'Parent', '', ?, ?)").run(now, now);
  db.exec("UPDATE nodes SET parent_id = 'parent' WHERE id = 'target'");
  expect((await readCompanionContentSource('target')).content).toBe('Keep this body');
  db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = 'parent'").run(now);
  await expect(readCompanionContentSource('target')).rejects.toThrow('cannot be edited');
  db.exec("UPDATE nodes SET deleted_at = NULL, parent_id = 'target' WHERE id = 'parent'");
  await expect(readCompanionContentSource('target')).rejects.toThrow('cannot be edited');
  // Construct a malformed historical library; ordinary writes retain foreign-key enforcement.
  db.pragma('foreign_keys = OFF');
  db.exec("UPDATE nodes SET parent_id = 'missing' WHERE id = 'target'");
  db.pragma('foreign_keys = ON');
  await expect(readCompanionContentSource('target')).rejects.toThrow('cannot be edited');
  await expect(readCompanionContentSource('missing')).rejects.toThrow('cannot be edited');
});
