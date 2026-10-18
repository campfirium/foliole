// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readRequestSyncAttachmentNeedsSlice } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { seedAttachmentThroughputFixture } from '../shared/platform/companion/runtime/attachmentThroughputFixtureData.js';

it('discovers all benchmark references through current durable attachment demand', async () => {
  const sqlite = new Database(':memory:');
  initializeDatabaseSchema(sqlite);
  const db = createBetterSqliteDbPort(sqlite);
  const keys = ['a', 'b', 'c', 'd'].map(character => `${character.repeat(64)}.png`);
  try {
    await seedAttachmentThroughputFixture(db, keys);
    const host = { readSnapshot: <T>(read: (port: typeof db) => Promise<T>) => db.transaction(read),
      write: <T>(write: (port: typeof db) => Promise<T>) => db.transaction(write) };
    const result = await readRequestSyncAttachmentNeedsSlice(host,
      async requested => requested.map(() => false), () => false);
    expect(new Set(result.keys)).toEqual(new Set(keys));
    expect(await db.query("SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'scale-%'"))
      .toEqual([{ count: 30000 }]);
    expect(await db.query('SELECT COUNT(*) AS count FROM attachment_parse_queue')).toEqual([{ count: 0 }]);
  } finally { sqlite.close(); }
});
