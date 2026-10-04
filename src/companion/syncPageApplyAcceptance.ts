import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements';
import type { DbPort } from '../../lib/core/sync/dbPort';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema';
import { createIsolatedCapacitorDatabaseManager } from '../shared/platform/capacitorSqliteDbPort';

const COUNT = 32;
const UPDATED = '2026-10-03T00:00:00.000Z';

export async function seedKnownReadingPage(receiver: DbPort, pack: DbPort) {
  for (const statement of COMPANION_SCHEMA_STATEMENTS) await receiver.run(statement);
  for (const statement of PACK_SCHEMA) await pack.run(statement);
  await pack.run(`INSERT INTO pack_manifest (key, value) VALUES ('manifest_json', ?)`,
    [JSON.stringify({ source_epoch: 'isolated-reading-page', frontier_state_seq: COUNT,
      from_state_seq: 0, to_state_seq: COUNT })]);
  for (let index = 0; index < COUNT; index++) {
    const id = `reading-${index}`;
    const hash = `reading-hash-${index}`;
    await receiver.run(`INSERT INTO nodes (id, kind, title, created_at, updated_at)
      VALUES (?, 'topic', ?, ?, ?)`, [id, id, UPDATED, UPDATED]);
    await receiver.run(`INSERT INTO node_reading (node_id, last_handled_at, next_at,
      repetition_count, state) VALUES (?, ?, ?, 1, 'active')`, [id, UPDATED, UPDATED]);
    await receiver.run(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at)
      VALUES ('node_reading', ?, ?, ?, 'receiver', ?)`, [id, index + 1, hash, UPDATED]);
    await pack.run(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
      content_hash, last_modified_by_host_name, updated_at)
      VALUES ('node_reading', ?, ?, ?, 'source', ?)`, [id, index + 1, hash, UPDATED]);
    await pack.run(`INSERT INTO sync_objects (object_type, object_id, content_hash,
      payload_json, updated_at) VALUES ('node_reading', ?, ?, ?, ?)`, [id, hash,
      JSON.stringify({ state: 'active', last_handled_at: UPDATED, next_at: UPDATED,
        repetition_count: 1 }), UPDATED]);
  }
}

export async function measureKnownReadingPage(port: DbPort) {
  let queries = 0;
  let runs = 0;
  const wrap = (inner: DbPort): DbPort => ({
    async query<T extends Record<string, unknown>>(sql: string, params = []) {
      queries++;
      return inner.query<T>(sql, params);
    },
    async run(sql, params) { runs++; return inner.run(sql, params); },
    transaction(execute) { return inner.transaction((tx) => execute(wrap(tx))); }
  });
  const started = performance.now();
  const result = await applySyncPackNodeSurfaceWithDbPort(wrap(port), {
    currentCursor: 0, hostName: 'receiver', sourceHostName: 'source',
    enqueueSearchInvalidations: false, incomingAlias: 'inc'
  });
  const elapsedMs = performance.now() - started;
  if (result.appliedObjectCount !== 0 || result.toStateSeq !== COUNT) {
    throw new Error('Known reading page did not remain unchanged');
  }
  const [count] = await port.query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM node_reading WHERE state = 'active'");
  if (count?.count !== COUNT) throw new Error('Known reading page lost local rows');
  return { facts: COUNT, appliedObjects: result.appliedObjectCount, queries, runs, elapsedMs };
}

export async function runIsolatedKnownReadingPage() {
  const manager = createIsolatedCapacitorDatabaseManager('android');
  const receiverName = `sync-page-receiver-${Date.now()}`;
  const packName = `sync-page-pack-${Date.now()}`;
  const receiver = await manager.create(receiverName);
  const pack = await manager.create(packName);
  try {
    await receiver.open();
    await pack.open();
    const receiverPort = receiver.port;
    const packPort = pack.port;
    await seedKnownReadingPage(receiverPort, packPort);
    const packPath = await pack.prepareAttachedRead();
    await receiverPort.run(`ATTACH DATABASE '${packPath.replaceAll("'", "''")}' AS inc`);
    try { return await measureKnownReadingPage(receiverPort); }
    finally { await receiverPort.run('DETACH DATABASE inc'); }
  } finally {
    try { await receiver.dispose(); } finally { await pack.dispose(); }
  }
}
