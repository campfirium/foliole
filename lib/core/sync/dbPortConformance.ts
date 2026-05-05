import type { DbPort, DbPortFactory } from './dbPort.js';

interface TestApi {
  expect: typeof import('vitest').expect;
  it: typeof import('vitest').it;
}

export function registerDbPortConformanceTests(label: string, factory: DbPortFactory, api: TestApi) {
  registerRollbackTest(label, factory, api);
  registerBlobTest(label, factory, api);
  registerAttachTest(label, factory, api);
  registerBusyTest(label, factory, api);
}

function registerRollbackTest(label: string, factory: DbPortFactory, api: TestApi) {
  api.it(`${label}: rolls back failed transactions`, () => testRollback(factory, api.expect));
}

function registerBlobTest(label: string, factory: DbPortFactory, api: TestApi) {
  api.it(`${label}: supports batch insert and blob roundtrip`, () => testBlob(factory, api.expect));
}

function registerAttachTest(label: string, factory: DbPortFactory, api: TestApi) {
  api.it(`${label}: supports attach database and cross-database insert`, () => testAttach(factory, api.expect));
}

function registerBusyTest(label: string, factory: DbPortFactory, api: TestApi) {
  api.it(`${label}: exposes journal mode and busy errors in a normalizable shape`, () => testBusy(factory, api.expect));
}

async function testRollback(factory: DbPortFactory, expect: TestApi['expect']) {
  const { db } = await openIsolated(factory, 'rollback');
  try {
    await createItemsTable(db);
    await expect(db.transaction(async (tx) => {
      await tx.run('INSERT INTO items (id, value) VALUES (?, ?)', ['kept', 'no']);
      throw new Error('rollback');
    })).rejects.toThrow('rollback');

    await expectRows(db, [], expect);
  } finally {
    await factory.close(db);
  }
}

async function testBlob(factory: DbPortFactory, expect: TestApi['expect']) {
  const { db } = await openIsolated(factory, 'blob');
  const blob = new Uint8Array([1, 2, 3, 4, 5]);
  try {
    await createItemsTable(db);
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO items (id, value, body) VALUES (?, ?, ?)', ['a', 'A', blob]);
      await tx.run('INSERT INTO items (id, value, body) VALUES (?, ?, ?)', ['b', 'B', blob]);
    });

    const rows = await db.query<{ id: string; body: Uint8Array }>('SELECT id, body FROM items ORDER BY id');
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(Array.from(rows[0].body)).toEqual([1, 2, 3, 4, 5]);
  } finally {
    await factory.close(db);
  }
}

async function testAttach(factory: DbPortFactory, expect: TestApi['expect']) {
  const { db: main } = await openIsolated(factory, 'attach-main');
  const incomingName = uniqueDatabaseName('incoming');
  const incoming = await factory.open(incomingName);
  try {
    await createItemsTable(main);
    await createItemsTable(incoming);
    await incoming.run('INSERT INTO items (id, value) VALUES (?, ?)', ['from-pack', 'pack']);
    await factory.close(incoming);

    await main.run(`ATTACH DATABASE ${sqlString(factory.path(incomingName))} AS incoming`);
    try {
      await main.transaction(async (tx) => {
        await tx.run('INSERT INTO items (id, value, body) SELECT id, value, body FROM incoming.items');
      });
    } finally {
      await main.run('DETACH DATABASE incoming');
    }

    await expectRows(main, [{ id: 'from-pack', value: 'pack' }], expect);
  } finally {
    await factory.close(main);
  }
}

async function testBusy(factory: DbPortFactory, expect: TestApi['expect']) {
  const { db: first, name } = await openIsolated(factory, 'busy');
  const second = await factory.open(name);
  try {
    const journalRows = await first.query<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(typeof journalRows[0].journal_mode).toBe('string');

    await first.run('CREATE TABLE locks (id TEXT PRIMARY KEY)');
    await first.run('BEGIN IMMEDIATE');
    try {
      await expect(second.run('INSERT INTO locks (id) VALUES (?)', ['blocked'])).rejects.toMatchObject({
        code: expect.stringMatching(/SQLITE_(BUSY|LOCKED)/)
      });
    } finally {
      await first.run('ROLLBACK');
    }
  } finally {
    await factory.close(second);
    await factory.close(first);
  }
}

async function createItemsTable(db: DbPort) {
  await db.run('CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT NOT NULL, body BLOB)');
}

async function expectRows(
  db: DbPort,
  expected: Array<{ id: string; value: string }>,
  expect: TestApi['expect']
) {
  const rows = await db.query<{ id: string; value: string }>('SELECT id, value FROM items ORDER BY id');
  expect(rows).toEqual(expected);
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function openIsolated(factory: DbPortFactory, prefix: string) {
  const name = uniqueDatabaseName(prefix);
  return {
    db: await factory.open(name),
    name
  };
}

let uniqueCounter = 0;

function uniqueDatabaseName(prefix: string) {
  uniqueCounter += 1;
  return `${prefix}-${Date.now()}-${uniqueCounter}`;
}
