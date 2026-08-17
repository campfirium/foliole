// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-watched-folder-claim-delivery-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir, app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'), app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';

import {
  acknowledgeWatchedFolderDesktopDeliveries,
  ensureWatchedFolderClaimReceipts,
  isWatchedFolderClaimConfirmed
} from './watchedFolderClaimDelivery.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-watched-folder-claim-delivery-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('promotes only after every current desktop generation acknowledges the proposal frontier', () => {
  const driver = openDatabaseConnection().driver;
  seedGroup(driver);
  seedProposal(driver, 7);

  ensureWatchedFolderClaimReceipts(driver, 'binding-1');
  expect(driver.queryOne<{ status: string }>(
    "SELECT status FROM sync_delivery_receipts WHERE stream_name = 'watched_folder_claim'"
  )?.status).toBe('pending');
  expect(acknowledgeWatchedFolderDesktopDeliveries(driver, 'desktop-b', 6)).toBe(0);
  expect(acknowledgeWatchedFolderDesktopDeliveries(driver, 'desktop-other', 7)).toBe(0);
  expect(acknowledgeWatchedFolderDesktopDeliveries(driver, 'desktop-b', 7)).toBe(1);
  expect(isWatchedFolderClaimConfirmed(driver, 'binding-1')).toBe(true);

  driver.execute(
    `UPDATE sync_group_members SET authorization_id = 'auth-b-2', joined_at = '2026-08-17T02:00:00Z'
     WHERE group_id = 'group-1' AND device_id = 'desktop-b'`
  );
  expect(isWatchedFolderClaimConfirmed(driver, 'binding-1')).toBe(false);
  expect(acknowledgeWatchedFolderDesktopDeliveries(driver, 'desktop-b', 7)).toBe(1);
  expect(isWatchedFolderClaimConfirmed(driver, 'binding-1')).toBe(true);
});

it('excludes mobile and departed peers without treating an active desktop as empty confirmation', () => {
  const driver = openDatabaseConnection().driver;
  seedGroup(driver);
  seedProposal(driver, 9);

  expect(isWatchedFolderClaimConfirmed(driver, 'binding-1')).toBe(false);
  driver.execute(
    `UPDATE sync_group_members SET state = 'left', left_at = '2026-08-17T03:00:00Z'
     WHERE group_id = 'group-1' AND device_id = 'desktop-b'`
  );
  expect(isWatchedFolderClaimConfirmed(driver, 'binding-1')).toBe(true);
});

function seedGroup(driver: ReturnType<typeof openDatabaseConnection>['driver']) {
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, timeline_id, created_by_device_id, created_at, updated_at)
     VALUES ('group-1', 'Devices', 'timeline-1', 'desktop-a', '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z')`
  );
  driver.execute(
    `INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_id, member_state, updated_at)
     VALUES (1, 'group-1', 'desktop-a', 'active', '2026-08-17T00:00:00Z')`
  );
  for (const member of [
    ['desktop-a', 'desktop', 'auth-a'],
    ['desktop-b', 'windows', 'auth-b'],
    ['mobile-c', 'android', 'auth-c']
  ] as const) {
    driver.execute(
      `INSERT INTO sync_group_members (
        group_id, device_id, device_kind, device_name, state, approved_by_device_id,
        authorization_id, joined_at, updated_at
      ) VALUES ('group-1', ?, ?, ?, 'active', 'desktop-a', ?, '2026-08-17T00:00:00Z', '2026-08-17T00:00:00Z')`,
      [member[0], member[1], member[0], member[2]]
    );
  }
}

function seedProposal(driver: ReturnType<typeof openDatabaseConnection>['driver'], stateSeq: number) {
  driver.execute(
    `INSERT INTO watched_folder_bindings (
      binding_id, owner_installation_id, owner_device_name, owner_platform, claim_state, claim_revision,
      action_mode, archive_path, highlight_mode, highlight_path, keep_preview_json, primary_path,
      enabled, availability, created_at, updated_at, deleted_at
    ) VALUES (
      'binding-1', 'installation-a', 'Mac', 'darwin', 'proposed', 'claim-1',
      'keep', '', 'off', '', NULL, '/mac/inbox', 0, 'available',
      '2026-08-17T01:00:00Z', '2026-08-17T01:00:00Z', NULL
    )`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
      object_type, object_id, state_seq, content_hash, last_modified_by_device_id,
      updated_at, sync_dirty, deleted_at
    ) VALUES ('watched_folder', 'binding-1', ?, 'hash-claim-1', 'desktop-a',
      '2026-08-17T01:00:00Z', 1, NULL)`,
    [stateSeq]
  );
}
