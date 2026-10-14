// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';
import { createFakeCapacitorConnection } from './companionSyncNodeVersionsTestSupport';

it.each(['ios', 'android'])('persists exact bigint byte lengths through the %s JSON bridge as SQLite integers', async (platform) => {
  const database = new Database(':memory:');
  try {
    database.exec('CREATE TABLE byte_lengths (bytes INTEGER NOT NULL)');
    const native = createFakeCapacitorConnection(database);
    const connection = {
      ...native,
      run: (sql: string, params: unknown[]) => native.run(sql, JSON.parse(JSON.stringify(params))),
      query: (sql: string, params: unknown[]) => native.query(sql, JSON.parse(JSON.stringify(params)))
    };
    const db = createCapacitorSqliteDbPort(connection as never, platform);
    for (const byteLength of [0n, 1048533n]) {
      await db.run('INSERT INTO byte_lengths (bytes) VALUES (?)', [byteLength]);
      expect(await db.query('SELECT bytes, typeof(bytes) AS type FROM byte_lengths WHERE bytes = ?', [byteLength]))
        .toEqual([{ bytes: Number(byteLength), type: 'integer' }]);
    }
    expect(database.prepare('SELECT bytes, typeof(bytes) AS type FROM byte_lengths ORDER BY bytes').all())
      .toEqual([{ bytes: 0, type: 'integer' }, { bytes: 1048533, type: 'integer' }]);
  } finally {
    database.close();
  }
});
