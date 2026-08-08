// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../attachments/resourceResolver.js', () => ({
  resolveAttachmentStoragePath: (attachmentId: string) => path.join(root, 'assets', attachmentId)
}));

import { initializeDatabaseConnection } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { recoverInterruptedDesktopSyncGroupProvisioning } from './syncGroupProvisioningRecovery.js';

let sqlite: Database.Database;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-provisioning-recovery-'));
  sqlite = new Database(':memory:');
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite };
  initializeDatabaseConnection(connection);
  const now = '2026-08-08T00:00:00.000Z';
  sqlite.exec(`
    INSERT INTO sync_groups VALUES ('group-1', 'Studio', 'timeline-1', 'android-b', '${now}', '${now}');
    INSERT INTO sync_group_local_state VALUES (1, 'group-1', 'windows-c', 'provisioning', 3, '{}', '${now}');
    INSERT INTO sync_group_members (
      group_id, device_id, device_kind, device_name, state, approved_by_device_id,
      authorization_id, provisioning_cursor, joined_at, activated_at, left_at, updated_at
    ) VALUES ('group-1', 'windows-c', 'win32', 'Windows C', 'provisioning', 'android-b',
      'request-1', 3, '${now}', NULL, NULL, '${now}');
    INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('node-1', 'topic', 'Partial', 'partial body', '${now}', '${now}');
    INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
      VALUES ('attachment-1', 'partial.bin', 'application/octet-stream', 4, '${now}');
    INSERT INTO attachment_blobs (attachment_id, content_hash, storage_key, size_bytes, mime_type,
      availability, created_at) VALUES ('attachment-1', 'hash', 'hash', 4, 'application/octet-stream', 'cached', '${now}');
  `);
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'attachment-1'), 'part');
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(root, { force: true, recursive: true });
});

it('returns an interrupted desktop join to its original empty SQLite and file state', () => {
  const connection = { driver: createBetterSqlite3Driver(sqlite), sqlite };
  expect(recoverInterruptedDesktopSyncGroupProvisioning(connection)).toBe(true);
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM sync_groups').get()).toEqual({ value: 0 });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM nodes').get()).toEqual({ value: 0 });
  expect(sqlite.prepare('SELECT COUNT(*) AS value FROM attachments').get()).toEqual({ value: 0 });
  expect(fs.existsSync(path.join(root, 'assets', 'attachment-1'))).toBe(false);
  expect(recoverInterruptedDesktopSyncGroupProvisioning(connection)).toBe(false);
});
