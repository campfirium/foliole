import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { port, setupVersionCollectionFixture, sqlite } from '../../../electron/database/nodeVersionPayloadCollector.testSupport.js';

import { publishLocalNodePosition, publishLocalNodePositionPage } from './nodeVersionMemberPositionPublish.js';

setupVersionCollectionFixture();
afterEach(() => vi.useRealTimers());

function readDeclarations(database: Database.Database) {
  return {
    positions: database.prepare('SELECT * FROM node_version_member_positions ORDER BY fact_id').all(),
    states: database.prepare("SELECT * FROM sync_object_state WHERE object_type = 'node_position' ORDER BY object_id").all(),
    proof: database.prepare('SELECT * FROM node_version_local_proof_state').all()
  };
}

it('keeps the original declaration, pending tips and sequential revisions across repeated pages', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  sqlite.exec(`INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, body_text, snapshot_json)
    VALUES ('fork', 'node', 'B', 'local', 'now', 'fork-hash', 'fork-body', '{"content":"fork-body"}');
    INSERT INTO node_sync_version_parents VALUES ('fork', 'B', 0)`);
  const ids = ['node'];
  for (let index = 0; index < 127; index += 1) {
    const id = `node-${index}'quoted`;
    const version = `version-${index}`;
    ids.push(id);
    sqlite.prepare(`INSERT INTO nodes (id, kind, title, current_version_id, created_at, updated_at)
      VALUES (?, 'topic', 'Node', ?, 'now', 'now')`).run(id, version);
    sqlite.prepare(`INSERT INTO node_sync_versions
      (version_id, object_id, host_name, created_at, content_hash, body_text, snapshot_json)
      VALUES (?, ?, 'local', 'now', 'hash', 'body', '{"content":"body"}')`).run(version, id);
  }
  const reference = new Database(sqlite.serialize());
  try {
    const referencePort = createBetterSqliteDbPort(reference);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      for (const id of ids) await referencePort.transaction((tx) => publishLocalNodePosition(tx, id));
      await port.transaction((tx) => publishLocalNodePositionPage(tx, ids));
      expect(readDeclarations(sqlite)).toEqual(readDeclarations(reference));
    }
    let queries = 0;
    await port.transaction((tx) => publishLocalNodePositionPage({ ...tx,
      query: async (sql, params) => { queries += 1; return tx.query(sql, params); }
    }, ids));
    expect(queries).toBeLessThanOrEqual(3);
    expect(readDeclarations(sqlite)).toEqual(readDeclarations(reference));
  } finally {
    reference.close();
  }
});

it('does not publish incomplete bodies, unknown nodes, special nodes or inactive membership', async () => {
  sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL, snapshot_json = '{"content":null}'
    WHERE version_id = 'E'`);
  const before = readDeclarations(sqlite);
  await port.transaction((tx) => publishLocalNodePositionPage(tx, ['node', 'unknown', 'special-inbox']));
  expect(readDeclarations(sqlite)).toEqual(before);
  sqlite.exec('DELETE FROM sync_group_local_state');
  await port.transaction((tx) => publishLocalNodePositionPage(tx, ['node']));
  expect(readDeclarations(sqlite)).toEqual(before);
});

it('rolls back the whole declaration page on failure and rejects oversized pages', async () => {
  const before = readDeclarations(sqlite);
  await expect(port.transaction(async (tx) => {
    await publishLocalNodePositionPage(tx, ['node']);
    throw new Error('write_failed');
  })).rejects.toThrow('write_failed');
  expect(readDeclarations(sqlite)).toEqual(before);
  await expect(publishLocalNodePositionPage(port, Array<string>(129).fill('node')))
    .rejects.toThrow('node_position_page_too_large');
});
