// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS } from '../../lib/core/database/syncPackProgressSchemaStatements.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { installHistoricalDesktopSchema, restoreEmptyLegacyDailyFlowSchema } from './historicalMigration.test-support.js';

it.each(['desktop', 'companion'] as const)('retires historical attachment checkpoints from %s libraries without changing nodes', async (host) => {
  const sqlite = new Database(':memory:');
  try {
    if (host === 'desktop') installHistoricalDesktopSchema(sqlite, 118);
    else {
      sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
      restoreEmptyLegacyDailyFlowSchema(sqlite);
      sqlite.exec(SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS[3]);
      sqlite.pragma('user_version = 54');
    }
    sqlite.exec(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('original', 'topic', 'Original', 'original body', 'now', 'now');`);
    sqlite.prepare('INSERT INTO attachment_receive_checkpoints VALUES (?, ?, ?, ?)')
      .run('historical-hash', '/target.unverified', 3_145_728, 1_048_576);
    const port = createBetterSqliteDbPort(sqlite);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await port.transaction(tx => migrateCompanionDatabase(tx, 54, COMPANION_DATABASE_VERSION));
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'attachment_receive_checkpoints'").get())
      .toBeUndefined();
    expect(sqlite.prepare('SELECT title, content FROM nodes WHERE id = ?').get('original'))
      .toEqual({ title: 'Original', content: 'original body' });
    expect(sqlite.pragma('quick_check', { simple: true })).toBe('ok');
  } finally { sqlite.close(); }
});
