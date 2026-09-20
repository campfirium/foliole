import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import type { DbPort } from '../../lib/core/sync/dbPort';
import { createCapacitorSqliteDbPort } from '../shared/platform/capacitorSqliteDbPort';
import { loadIosCompanionWorkspaceSnapshot } from '../shared/platform/companion/sync/workspace-state/iosCompanionWorkspaceSnapshotStore';

import { seedCapacityFixture } from './capacityAcceptanceFixture';
import { assertDatabase, requireValue, sha256 } from './capacityAcceptanceSafety';

async function validateSnapshot(snapshot: Awaited<ReturnType<typeof loadIosCompanionWorkspaceSnapshot>>, count: number) {
  requireValue(snapshot, 'Snapshot is missing');
  requireValue(Object.keys(snapshot.nodesById).length === count, 'Node count mismatch');
  requireValue(snapshot.nodeOrder.length === count - count / 50, 'Visible order mismatch');
  for (let index = 0; index < count; index++) {
    const node = snapshot.nodesById[`node-${index}`];
    const expected = index % 20 === 0 ? ''
      : (`Synthetic measurement node ${index}.\n` + 'Representative prose. '.repeat(4096)).slice(0, 4096);
    requireValue(node?.content === expected, `Body mismatch: ${index}`);
  }
  return sha256(JSON.stringify(snapshot));
}

async function measureRun(db: DbPort, count: number, run: number) {
  const queries: { sql: string; params: unknown[]; rows: number; wallMs: number }[] = [];
  const measured: DbPort = { ...db, async query(sql, params = []) {
    const start = performance.now();
    const rows = await db.query(sql, params);
    queries.push({ sql, params: [...params], rows: rows.length, wallMs: performance.now() - start });
    return rows as never;
  }, transaction(execute) {
    return db.transaction(() => execute(measured));
  } };
  const start = performance.now();
  const snapshot = await loadIosCompanionWorkspaceSnapshot(measured);
  const totalMs = performance.now() - start;
  const queryWallMs = queries.reduce((sum, item) => sum + item.wallMs, 0);
  const snapshotHash = await validateSnapshot(snapshot, count);
  return { run, totalMs, queryWallMs, jsResidualMs: totalMs - queryWallMs, snapshotHash, queries };
}

export async function measureCapacityCase(connection: SQLiteDBConnection, platform: string, count: number) {
  assertDatabase(connection.getConnectionDBName(), count);
  const db = createCapacitorSqliteDbPort(connection, platform);
  requireValue((await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'android_metadata'")).length === 0,
    'Refusing to seed a nonempty database');
  await seedCapacityFixture(db, count);
  const environment = {
    version: await db.query('SELECT sqlite_version() AS version'),
    journal: await db.query('PRAGMA journal_mode'), cache: await db.query('PRAGMA cache_size'),
    statistics: await db.query("SELECT name FROM sqlite_master WHERE name LIKE 'sqlite_stat%'")
  };
  const runs: Awaited<ReturnType<typeof measureRun>>[] = [];
  for (let run = 0; run < 4; run++) runs.push(await measureRun(db, count, run));
  const plans = [];
  for (const query of runs[0]!.queries) plans.push({ sql: query.sql,
    plan: await db.query(`EXPLAIN QUERY PLAN ${query.sql}`, query.params as never) });
  requireValue(runs.every(run => run.snapshotHash === runs[0]!.snapshotHash), 'Unstable snapshot');
  return { fixture: { count, bodyBytes: 4096, imports: 0, analyzed: false }, environment,
    runs, plans, memory: null, memoryLimitation: 'Native/WebView memory was not sampled',
    timingBoundary: 'query wall time includes SQL, native bridge and DbPort normalization; residual is not pure render time' };
}
