// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';

import { createCompanionDatabase, migrateCompanionDatabase } from './companionDatabaseMigrationExecutor.js';
import { initializeDatabaseSchema } from './migrations.js';
import { SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS } from './syncIdentityEntityTriggerStatements.js';

it.each(['desktop', 'companion'])('repairs deployed %s foreground triggers without losing daily facts', async host => {
  const sqlite = new Database(':memory:');
  const db = createBetterSqliteDbPort(sqlite);
  try {
    if (host === 'desktop') initializeDatabaseSchema(sqlite);
    else await createCompanionDatabase(db, 88);
    sqlite.exec("INSERT INTO foreground_daily_time VALUES ('source:2026-10-16', 'source', '2026-10-16', 100)");
    for (const sql of SYNC_IDENTITY_ENTITY_TRIGGER_STATEMENTS.filter(sql => sql.includes('ON foreground_daily_time'))) sqlite.exec(sql);
    sqlite.pragma(`user_version = ${host === 'desktop' ? 159 : 88}`);
    expect(() => sqlite.exec('UPDATE foreground_daily_time SET duration_ms = 150')).toThrow('sync_identity_dirty_keys');
    const fail = () => { throw new Error('commit_failed'); };
    const upgrade = async (beforeVersionCommit?: () => void) => {
      if (host === 'desktop') initializeDatabaseSchema(sqlite, beforeVersionCommit ? { beforeVersionCommit } : {});
      else await db.transaction(tx => migrateCompanionDatabase(tx, 88, 89, beforeVersionCommit));
    };
    await expect(upgrade(fail)).rejects.toThrow('commit_failed');
    expect(() => sqlite.exec('UPDATE foreground_daily_time SET duration_ms = 150')).toThrow('sync_identity_dirty_keys');
    await upgrade();
    expect(sqlite.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 100 });
    sqlite.exec('UPDATE foreground_daily_time SET duration_ms = 150');
    sqlite.exec("INSERT INTO foreground_daily_time VALUES ('source:2026-10-17', 'source', '2026-10-17', 30)");
    expect(sqlite.prepare('SELECT SUM(duration_ms) total FROM foreground_daily_time').get()).toEqual({ total: 180 });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='sync_identity_dirty_keys'").get()).toBeUndefined();
  } finally { sqlite.close(); }
});
