// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createAttachmentReceiveCheckpoint } from '../../lib/core/sync/attachmentReceiveCheckpoint.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it.each(['desktop', 'companion'] as const)('adds checkpoints to existing %s libraries without changing nodes', async (host) => {
  const sqlite = new Database(':memory:');
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    sqlite.exec(`DROP TABLE attachment_receive_checkpoints;
      INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('original', 'topic', 'Original', 'original body', 'now', 'now');`);
    sqlite.pragma(`user_version = ${host === 'desktop' ? 117 : 53}`);
    const port = createBetterSqliteDbPort(sqlite);
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await migrateCompanionDatabase(port, 53, COMPANION_DATABASE_VERSION);
    const checkpoint = createAttachmentReceiveCheckpoint(port, '/target', 'hash');
    await checkpoint.save(3_145_728, 1_048_576);
    expect(await checkpoint.load(3_145_728)).toBe(1_048_576);
    expect(await checkpoint.load(4_194_304)).toBe(0);
    expect(sqlite.prepare('SELECT title, content FROM nodes WHERE id = ?').get('original'))
      .toEqual({ title: 'Original', content: 'original body' });
    await checkpoint.clear();
    expect(await checkpoint.load(3_145_728)).toBe(0);
    expect(sqlite.pragma('quick_check', { simple: true })).toBe('ok');
  } finally { sqlite.close(); }
});
