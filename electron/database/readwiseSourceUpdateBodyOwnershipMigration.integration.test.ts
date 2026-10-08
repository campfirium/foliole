// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { migrateCompanionReadwiseSourceUpdateBodyOwnership, migrateReadwiseSourceUpdateBodyOwnership }
  from '../../lib/core/database/readwiseSourceUpdateBodyOwnershipMigration.js';
import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((database) => database.close()));
const now = '2026-10-08T00:00:00.000Z';
function fixture() {
  const sqlite = new Database(':memory:'); databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite), port = createBetterSqliteDbPort(sqlite);
  function insert(id: string, body: string, owned = false) {
    const hash = upsertTextBodyBlob(driver, body, now);
    const state = { version: 6, metadata: { title: id }, annotations: [],
      sourceUpdate: { contentHash: hash, sourceUpdatedAt: now, status: 'pending', ...(owned ? { content: body } : {}) } };
    sqlite.prepare(`INSERT INTO import_sources (source_fingerprint,provider,source_kind,source_name,
      source_locator,first_imported_at,last_imported_at,last_content_fingerprint,latest_node_id,
      remote_provider,remote_document_id,remote_import_state_json)
      VALUES (?,'readwise','article',?,'locator',?,?,? ,?,'readwise',?,?)`)
      .run(id, id, now, now, hash, id, id, JSON.stringify(state));
    return { hash, state };
  }
  return { sqlite, port, insert };
}
async function migrate(host: ReturnType<typeof fixture>, adapter: 'desktop' | 'companion') {
  if (adapter === 'desktop') host.sqlite.transaction(() => migrateReadwiseSourceUpdateBodyOwnership(host.sqlite))();
  else await host.port.transaction(migrateCompanionReadwiseSourceUpdateBodyOwnership);
}

it.each(['desktop', 'companion'] as const)('preserves exact %s pending source updates in their original owners', async (adapter) => {
  const host = fixture();
  const bodies = ['', '\ufeff中😀\0tail', '中😀'.repeat(100000)];
  const original = bodies.map((body, index) => host.insert(`source-${index}`, body));
  const rows = () => host.sqlite.prepare('SELECT * FROM import_sources ORDER BY source_fingerprint').all() as
    { remote_import_state_json: string }[];
  const before = rows();
  await migrate(host, adapter);
  rows().forEach((row, index) => {
    const state = JSON.parse(row.remote_import_state_json);
    expect(state).toEqual({ ...original[index]!.state, sourceUpdate: {
      ...original[index]!.state.sourceUpdate, content: bodies[index] } });
    expect(normalizeReadwiseApiDocumentImportState(state).sourceUpdate?.content).toBe(bodies[index]);
    expect({ ...row, remote_import_state_json: before[index]!.remote_import_state_json }).toEqual(before[index]);
  });
  host.sqlite.exec('DROP TABLE content_blob_data');
  const owned = rows();
  await migrate(host, adapter);
  expect(rows()).toEqual(owned);
});

it.each(['desktop', 'companion'] as const)('rolls back %s owner conversion on missing bytes, bad UTF-8 or wrong identity', async (adapter) => {
  for (const failure of ['missing', 'utf8', 'hash']) {
    const host = fixture();
    host.insert('a', 'First'); const { hash } = host.insert('z', 'Last');
    if (failure === 'missing') host.sqlite.prepare('DELETE FROM content_blob_data WHERE hash = ?').run(hash);
    else host.sqlite.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?')
      .run(failure === 'utf8' ? Buffer.alloc(4, 255) : Buffer.from('Lost'), hash);
    const before = host.sqlite.prepare('SELECT * FROM import_sources ORDER BY source_fingerprint').all();
    await expect(migrate(host, adapter)).rejects.toThrow();
    expect(host.sqlite.prepare('SELECT * FROM import_sources ORDER BY source_fingerprint').all()).toEqual(before);
  }
});
