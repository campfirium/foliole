import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { expect, test } from '@playwright/test';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

const BUSINESS_NODE_ID = 'sync-group-cleanup-business-node';

test('ordinary desktop startup discards retired Sync Group state only', async () => {
  const artifactRoot = fs.mkdtempSync(path.resolve('.tmp/artifacts/t152-8-hidden-'));
  const env = { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: artifactRoot };
  let session = await launchDesktopSession({ env });

  try {
    const libraryHome = await session.electronApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME);
    if (!libraryHome) throw new Error('Desktop did not expose its isolated library home.');
    const databasePath = path.join(libraryHome, 'Data', 'foliole.db');
    await session.firstWindow.evaluate(async (nodeId) => {
      await globalThis.window?.__folioleWorkspaceDebug?.seedNodes?.([{
        content: '# Business data', id: nodeId, kind: 'topic', title: 'Business data'
      }]);
    }, BUSINESS_NODE_ID);
    await session.close();

    installRetiredSyncState(databasePath);
    session = await launchDesktopSession({ env });

    await expect.poll(() => session.firstWindow.evaluate((nodeId) =>
      globalThis.window?.__folioleWorkspaceDebug?.getNode?.(nodeId)?.title ?? null,
    BUSINESS_NODE_ID)).toBe('Business data');
    expect(readCleanupResult(databasePath)).toEqual({
      devices: 0, groups: 0, legacyMembers: false, peers: 0, version: 78
    });
  } finally {
    await session.close().catch(() => undefined);
    fs.rmSync(artifactRoot, { force: true, recursive: true });
  }
});

function installRetiredSyncState(databasePath: string) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      DROP TRIGGER trg_sync_delivery_state_insert;
      DROP TRIGGER trg_sync_delivery_state_update;
      DROP TRIGGER trg_sync_delivery_device_leave;
      DROP TRIGGER trg_sync_delivery_review_insert;
      DROP TABLE sync_group_local_state;
      DROP TABLE sync_group_nonce_ledger;
      DROP TABLE sync_group_devices;
      DROP TABLE sync_groups;
      CREATE TABLE sync_groups (group_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
        timeline_id TEXT NOT NULL, created_by_host_name TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, workgroup_key TEXT);
      CREATE TABLE sync_group_members (group_id TEXT NOT NULL, host_name TEXT NOT NULL,
        host_platform TEXT NOT NULL, state TEXT NOT NULL, approved_by_host_name TEXT NOT NULL,
        authorization_id TEXT NOT NULL, joined_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE sync_group_local_state (singleton_id INTEGER PRIMARY KEY, group_id TEXT,
        local_host_name TEXT NOT NULL, member_state TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO sync_groups VALUES ('old-group','Old Group','timeline','Old Mac','old','old','key');
      INSERT INTO sync_group_members VALUES
        ('old-group','Old Mac','darwin','active','Old Mac','auth','old','old');
      INSERT INTO sync_group_local_state VALUES (1,'old-group','Old Mac','active','old');
      INSERT INTO sync_peers VALUES ('old-route','paired',NULL,'legacy-cursor','old');
      PRAGMA user_version = 77;
    `);
  } finally {
    database.close();
  }
}

function readCleanupResult(databasePath: string) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return {
      devices: Number(database.prepare('SELECT COUNT(*) AS count FROM sync_group_devices').get()?.count),
      groups: Number(database.prepare('SELECT COUNT(*) AS count FROM sync_groups').get()?.count),
      legacyMembers: Boolean(database.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sync_group_members'"
      ).get()),
      peers: Number(database.prepare('SELECT COUNT(*) AS count FROM sync_peers').get()?.count),
      version: Number(database.prepare('PRAGMA user_version').get()?.user_version)
    };
  } finally {
    database.close();
  }
}
