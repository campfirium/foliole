// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { port, proveBase, setupVersionCollectionFixture, sqlite } from './nodeVersionPayloadCollector.testSupport.js';

setupVersionCollectionFixture();

function hold(versionId: string, holdId = 'editor', nodeId = 'node') {
  return retainLocalEditBase(port, { holdId, nodeId, versionId });
}

it('holds readable empty and exact 1 MiB UTF-8 versions without loading their text', async () => {
  const body = '中😀'.repeat(149796) + 'abcd';
  expect(Buffer.byteLength(body)).toBe(1_048_576);
  for (const [versionId, text] of [['A', ''], ['B', body]] as const) {
    sqlite.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
      .run(text, JSON.stringify({ id: 'node', content: '' }), versionId);
    const sizes: number[] = [];
    const statements: string[] = [];
    await retainLocalEditBase({ ...port, async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      statements.push(sql);
      const rows = await port.query<T>(sql, params);
      for (const row of rows) for (const value of Object.values(row)) {
        if (typeof value === 'string') sizes.push(Buffer.byteLength(value));
      }
      return rows;
    } }, { holdId: versionId, nodeId: 'node', versionId });
    expect(sizes.every((size) => size <= 32)).toBe(true);
    expect(statements.some((sql) => /content_body_chunks|content_blob_data/u.test(sql))).toBe(false);
    expect(sqlite.prepare('SELECT body_text = ? AS exact FROM node_sync_versions WHERE version_id = ?').get(text, versionId))
      .toEqual({ exact: 1 });
  }
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds ORDER BY hold_id').all())
    .toEqual([{ hold_id: 'A', version_id: 'A' }, { hold_id: 'B', version_id: 'B' }]);
});

it('retains parent identity after body deletion while rejecting a wrong node or absent version', async () => {
  await expect(hold('A', 'editor', 'other')).rejects.toThrow('content_edit_base_unavailable');
  sqlite.prepare('UPDATE node_sync_versions SET body_text = NULL, snapshot_json = ? WHERE version_id = ?')
    .run(JSON.stringify({ id: 'node', content: null }), 'A');
  await hold('A');
  await expect(hold('missing')).rejects.toThrow('content_edit_base_unavailable');
  expect(sqlite.prepare('SELECT version_id FROM node_version_local_holds').pluck().get()).toBe('A');
});

it('updates one editor hold and releases its submitted prefix while preserving another holder and device base', async () => {
  proveBase('A');
  await hold('C');
  await hold('D', 'editor:edit:submitted');
  await hold('D');
  expect(sqlite.prepare("SELECT version_id FROM node_version_local_holds WHERE hold_id = 'editor'").pluck().get()).toBe('D');
  expect(sqlite.prepare("SELECT count(*) FROM node_version_local_holds WHERE hold_id = 'editor:edit:submitted'").pluck().get()).toBe(0);
  await hold('B', 'other-editor');
  await hold('C', 'editor:edit:submitted');
  const edges = sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all();
  await releaseLocalEditBase(port, 'editor', 'node');
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds').all())
    .toEqual([{ hold_id: 'other-editor', version_id: 'B' }]);
  expect(sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE body_text IS NOT NULL ORDER BY version_id').pluck().all())
    .toEqual(['A', 'E']);
  expect(sqlite.prepare('SELECT version_id FROM node_sync_versions ORDER BY version_id').pluck().all())
    .toEqual(['A', 'B', 'C', 'D', 'E']);
  expect(sqlite.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id').all()).toEqual(edges);
});

it('rolls back release and collection together when version retirement fails', async () => {
  proveBase('A');
  await hold('C');
  const before = sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  sqlite.exec("CREATE TRIGGER reject_retirement BEFORE UPDATE ON node_sync_versions BEGIN SELECT RAISE(ABORT, 'retirement_failed'); END");
  await expect(releaseLocalEditBase(port, 'editor', 'node')).rejects.toThrow('retirement_failed');
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds').all())
    .toEqual([{ hold_id: 'editor', version_id: 'C' }]);
  expect(sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
});
