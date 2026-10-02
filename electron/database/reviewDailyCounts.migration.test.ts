// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { LATEST_NUMBERED_SCHEMA_MIGRATIONS } from '../../lib/core/database/numberedMigrationLatestRegistry.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('installs daily counting on desktop and companion upgrades while retaining existing reading data', async () => {
  for (const schema of [DESKTOP_FRESH_SCHEMA_STATEMENTS, COMPANION_SCHEMA_STATEMENTS]) {
    const db = new Database(':memory:');
    try {
      for (const sql of schema) db.exec(sql);
      db.exec(`DROP TABLE topic_daily_count_entries; DROP TABLE topic_daily_counts; DROP TABLE topic_daily_count_coverage;
        INSERT INTO nodes(id, title, created_at, updated_at) VALUES ('topic', 'Retained', '2026-10-01', '2026-10-01');
        INSERT INTO node_reading(node_id, last_handled_at, next_at, repetition_count, state)
          VALUES ('topic', '2026-10-01T08:00:00Z', '2026-10-02T08:00:00Z', 7, 'active')`);
      if (schema === DESKTOP_FRESH_SCHEMA_STATEMENTS) {
        LATEST_NUMBERED_SCHEMA_MIGRATIONS.find((entry) => entry.version === 125)!.migrate(db);
      } else {
        const port = createBetterSqliteDbPort(db);
        await port.transaction((tx) => migrateCompanionDatabase(tx, 59, 60));
      }
      expect(db.prepare('SELECT repetition_count FROM node_reading').pluck().get()).toBe(7);
      expect(db.prepare('SELECT count(*) FROM topic_daily_counts').pluck().get()).toBe(0);
      expect(db.prepare('SELECT started_at FROM topic_daily_count_coverage').pluck().get()).toBeTruthy();
      db.prepare('INSERT INTO topic_daily_count_entries VALUES (?, ?, ?)').run('2026-10-02:topic', '2026-10-02', 'topic');
      expect(db.prepare('SELECT count FROM topic_daily_counts').pluck().get()).toBe(1);
    } finally { db.close(); }
  }
});
