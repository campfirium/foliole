// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../electron/database/betterSqliteDbPort.js';
import { migrateCompanionDatabase } from '../../lib/core/database/companionDatabaseMigrationExecutor.js';
import { COMPANION_DATABASE_VERSION } from '../../lib/platform/nativeCompanionContract.js';

import { persistCompanionCapturedText } from '../../src/companion/companionCaptureTextActions';
import { loadCompanionWorkspaceSyncState } from '../../src/shared/platform/companionWorkspaceSync';
import { createFakeCapacitorDatabaseManager } from '../../src/shared/platform/companionSyncNodeVersionsTestSupport';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../../src/shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';

import { createFriLegacyFixture, readFriUpgradeFacts, verifyFriUpgradeFacts } from './fri-database-upgrade.mjs';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../../src/shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => true },
    registerPlugin: () => createCompanionNativeSyncStub() };
});

// Environment guard: Needs retained Apple SQLCipher 4.17 framework | 2026-11-03 | revive: set FOLIOLE_IOS_LEGACY_SQLCIPHER_FRAMEWORK
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
      await initializeIosCompanionDatabase({ booted_at: '2026-11-03T00:00:00Z', database_path: null,
        database_ready: false, host_name: 'Upgrade', runtime_kind: 'android-capacitor' },
      createFakeCapacitorDatabaseManager(sqlite, true, () => {}));
      const state = await loadCompanionWorkspaceSyncState();
      await persistCompanionCapturedText({ deviceId: state.device_id ?? 'upgrade-device',
        snapshot: state.workspace_snapshot, text: 'Fri upgrade subsequent write.' });
      await closeIosCompanionDatabase();
      sqlite = new Database(fixture.database);
      const after = sqlite.prepare(`SELECT
        (SELECT content FROM nodes WHERE id='upgrade-node') body,
        (SELECT grade FROM review_log WHERE id='review-1') grade,
        (SELECT op_id FROM review_log WHERE id='review-1') operation,
        (SELECT due FROM node_review WHERE node_id='upgrade-node') due,
        (SELECT value FROM companion_meta WHERE key='sync_pack_cursor') cursor,
        (SELECT count(*) FROM nodes WHERE content='Fri upgrade subsequent write.' AND deleted_at IS NULL) new_writes`).get();
      expect(verifyFriUpgradeFacts(before, after)).toMatchObject({ retained: true });
      expect(sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get('upgrade-node'))
        .toBe('Legacy upgrade retained sentence.');
    } finally { await closeIosCompanionDatabase(); if (sqlite?.open) sqlite.close(); rmSync(root, { recursive: true, force: true }); }
  }
);
