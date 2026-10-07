// @vitest-environment node
import { expect, it } from 'vitest';

import { migrateBodyContentStorage } from '../../lib/core/database/bodyContentMigration.js';
import { migrateBodyContentOwners } from '../../lib/core/database/bodyContentOwnerMigration.js';
import type { DbParams, DbRow } from '../../lib/core/sync/dbPort.js';
import { releaseLocalEditBase, retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';

import { port, proveBase, setupVersionCollectionFixture, sqlite } from './nodeVersionPayloadCollector.testSupport.js';

setupVersionCollectionFixture();

async function migrate() {
  await port.transaction(async (tx) => {
    await migrateBodyContentStorage(tx);
    await migrateBodyContentOwners(tx, 'desktop');
    await tx.run('DROP TABLE content_blob_data');
  });
}

function hold(versionId: string, holdId = 'editor', nodeId = 'node') {
  return retainLocalEditBase(port, { holdId, nodeId, versionId, bodyStorage: 'chunked' });
}

it('holds readable empty and large stable versions with JSON null content without reading their bytes', async () => {
  const body = '\ufeff中😀\0'.repeat(400_000);
  for (const [version, text] of [['A', ''], ['B', body]] as const) {
    sqlite.prepare('UPDATE node_sync_versions SET body_text = ?, snapshot_json = ? WHERE version_id = ?')
      .run(text, JSON.stringify({ id: 'node', content: text }), version);
  }
  await migrate();
  for (const versionId of ['A', 'B']) {
    expect(sqlite.prepare("SELECT body_text, json_type(snapshot_json, '$.content') AS content FROM node_sync_versions WHERE version_id = ?")
      .get(versionId)).toEqual({ body_text: null, content: 'null' });
    const statements: string[] = [];
    await retainLocalEditBase({ ...port, async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      statements.push(sql);
      return port.query<T>(sql, params);
    } }, { holdId: versionId, nodeId: 'node', versionId, bodyStorage: 'chunked' });
    expect(statements.some((sql) => /content_body_chunks|content_blob_data/u.test(sql))).toBe(false);
  }
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds ORDER BY hold_id').all())
    .toEqual([{ hold_id: 'A', version_id: 'A' }, { hold_id: 'B', version_id: 'B' }]);
});

it('rejects wrong node, retired, unavailable and absent or unverified stable headers', async () => {
  await migrate();
  await expect(hold('A', 'editor', 'other')).rejects.toThrow('content_edit_base_unavailable');
  for (const [version, state] of [['A', 'retired'], ['B', 'unavailable']] as const) {
    sqlite.prepare('UPDATE node_sync_versions SET body_state = ? WHERE version_id = ?').run(state, version);
    await expect(hold(version)).rejects.toThrow('content_edit_base_unavailable');
  }
  sqlite.prepare('UPDATE node_sync_versions SET body_blob_hash = ? WHERE version_id = ?').run('0'.repeat(64), 'C');
  await expect(hold('C')).rejects.toThrow('content_edit_base_unavailable');
  sqlite.exec('DROP TRIGGER content_bodies_immutable_update');
  sqlite.exec("UPDATE content_bodies SET verified = 0 WHERE hash = (SELECT body_blob_hash FROM node_sync_versions WHERE version_id = 'D')");
  await expect(hold('D')).rejects.toThrow('content_edit_base_unavailable');
  expect(sqlite.prepare('SELECT count(*) FROM node_version_local_holds').pluck().get()).toBe(0);
});

it('updates one editor hold and releases its submitted prefix while preserving another holder and device base', async () => {
  proveBase('A');
  await migrate();
  await hold('C');
  await hold('D', 'editor:edit:submitted');
  await hold('D');
  expect(sqlite.prepare("SELECT version_id FROM node_version_local_holds WHERE hold_id = 'editor'").pluck().get()).toBe('D');
  expect(sqlite.prepare("SELECT count(*) FROM node_version_local_holds WHERE hold_id = 'editor:edit:submitted'").pluck().get()).toBe(0);
  await hold('B', 'other-editor');
  await hold('C', 'editor:edit:submitted');
  await releaseLocalEditBase(port, 'editor', 'node', 'chunked');
  expect(sqlite.prepare('SELECT hold_id, version_id FROM node_version_local_holds').all())
    .toEqual([{ hold_id: 'other-editor', version_id: 'B' }]);
  expect(sqlite.prepare("SELECT version_id FROM node_sync_versions WHERE body_state = 'readable' ORDER BY version_id").pluck().all())
    .toEqual(['A', 'B', 'E']);
});

it('preserves the default continuous hold contract', async () => {
  await retainLocalEditBase(port, { holdId: 'editor', nodeId: 'node', versionId: 'A' });
  expect(sqlite.prepare('SELECT version_id FROM node_version_local_holds').pluck().get()).toBe('A');
});
