import { CapacitorSQLite as sqlite, SQLiteDBConnection } from '@capacitor-community/sqlite';

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tables = ['snapshot_inventory', 'snapshot_versions', 'snapshot_bodies'] as const;

function connection(database: string, readonly: boolean) {
  return { database, readonly };
}

async function query(database: string, readonly: boolean, statement: string) {
  return new SQLiteDBConnection(database, readonly, sqlite).query(statement, []);
}

async function writeRevision(database: string, revision: number) {
  await sqlite.beginTransaction({ database });
  try {
    for (const table of tables) {
      await sqlite.run({ database, readonly: false, transaction: false,
        statement: `UPDATE ${table} SET revision=?, payload=?`,
        values: [revision, 'x'.repeat(8192) + revision] });
    }
    await sqlite.commitTransaction({ database });
  } catch (error) {
    await sqlite.rollbackTransaction({ database });
    throw error;
  }
}

async function readRevision(database: string, table: string) {
  const result = await query(database, true, `SELECT revision FROM ${table}`);
  const value: unknown = result.values?.[0]?.revision;
  requireValue(typeof value === 'number', 'Missing revision');
  return value;
}

async function measureRound(database: string, round: number) {
  const cancelled = round % 2 === 0;
  const cancel = new Error('F1 synthetic cancellation');
  await query(database, true, 'BEGIN DEFERRED');
  let observation;
  try {
    const before = await readRevision(database, tables[0]);
    const started = performance.now();
    await writeRevision(database, round);
    const writeMs = performance.now() - started;
    const during = [];
    for (const table of tables) during.push(await readRevision(database, table));
    requireValue(before === round - 1 && during.every(value => value === before),
      'Snapshot mixed revisions');
    const held = await query(database, false, 'PRAGMA wal_checkpoint(PASSIVE)');
    observation = { round, cancelled, before, during, writeMs, held };
    if (cancelled) throw cancel;
  } catch (error) {
    if (error !== cancel) throw error;
  } finally {
    await query(database, true, 'ROLLBACK');
  }
  const after = await readRevision(database, tables[2]);
  const released = await query(database, false, 'PRAGMA wal_checkpoint(TRUNCATE)');
  requireValue(after === round && released.values?.[0]?.log === 0 &&
    released.values?.[0]?.busy === 0, 'Snapshot or WAL was not released');
  return { ...observation, after, released };
}

async function seed(database: string) {
  const mode = await query(database, false, 'PRAGMA journal_mode=WAL');
  requireValue(mode.values?.[0]?.journal_mode === 'wal', 'WAL unavailable');
  for (const table of tables) {
    await sqlite.execute({ database, readonly: false, transaction: false,
      statements: `CREATE TABLE ${table}(id INTEGER PRIMARY KEY, revision INTEGER, payload TEXT)` });
    await sqlite.run({ database, readonly: false, transaction: true,
      statement: `INSERT INTO ${table} VALUES(1,0,?)`, values: ['x'.repeat(8192)] });
  }
}

// No caller-supplied database, SQL or path. Own only this new scratch database.
export async function runReadonlySnapshotProbe(onPhase: (phase: string) => void) {
  const database = `f1_snapshot_${crypto.randomUUID().replaceAll('-', '')}`;
  onPhase('check-database');
  const exists = await sqlite.isDatabase({ database });
  requireValue(exists.result === false, 'Scratch database absence unverified');
  await sqlite.createConnection({ database, readonly: false, version: 1,
    encrypted: false, mode: 'no-encryption' });
  try {
    await sqlite.open(connection(database, false));
    onPhase('seed');
    await seed(database);
    await sqlite.createConnection({ database, readonly: true, version: 1,
      encrypted: false, mode: 'no-encryption' });
    try {
      onPhase('open-readonly');
      await sqlite.open(connection(database, true));
      const rounds = [];
      for (let round = 1; round <= 6; round++) {
        onPhase(`round-${round}`);
        rounds.push(await measureRound(database, round));
      }
      return { database, rounds };
    } finally {
      await sqlite.closeConnection(connection(database, true));
    }
  } finally {
    onPhase('cleanup');
    try { await sqlite.deleteDatabase(connection(database, false)); }
    finally { await sqlite.closeConnection(connection(database, false)); }
    requireValue((await sqlite.isDatabase({ database })).result === false,
      'Scratch database cleanup failed');
  }
}
