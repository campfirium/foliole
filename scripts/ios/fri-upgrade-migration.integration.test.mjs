// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { createFriLegacyFixture, readFriUpgradeFacts } from './fri-database-upgrade.mjs';

// SKIP: Needs retained Apple SQLCipher 4.17 framework | 2026-11-03 | revive: set FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK
it.runIf(Boolean(process.env.FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK))(
  'boots the old-engine physical fixture through current production migrations without losing original facts', async () => {
    const parent = path.resolve('.tmp/artifacts/fri-upgrade-migration');
    mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(path.join(parent, 'test-'));
    let sqlite;
    try {
      const fixture = createFriLegacyFixture({ repoRoot: process.cwd(), evidenceRoot: root,
        legacyFramework: process.env.FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK });
      const before = readFriUpgradeFacts(fixture.database);
      sqlite = new Database(fixture.database);
      const db = createBetterSqliteDbPort(sqlite);
      await db.transaction(tx => migrateCompanionDatabase(tx, 4, COMPANION_DATABASE_VERSION));
      expect(sqlite.pragma('user_version', { simple: true })).toBe(COMPANION_DATABASE_VERSION);
      expect(readFriUpgradeFacts(fixture.database)).toEqual(before);
      sqlite.close();
      sqlite = new Database(fixture.database);
      expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('upgrade-node'))
        .toBe('Legacy upgrade retained sentence.');
    } finally { sqlite?.close(); rmSync(root, { recursive: true, force: true }); }
  }
);
