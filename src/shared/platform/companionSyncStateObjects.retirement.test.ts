import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort.js';
import { computeSyncContentHash } from '../../../lib/core/database/syncState.js';

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  owner: null as unknown as { databasePath: string; runWriter<T>(task: (db: never) => Promise<T>): Promise<T> },
  prepare: vi.fn()
}));

vi.mock('./companionRuntimeCapabilities', () => ({
  getCompanionRuntimeCapability: () => ({ kind: 'android-native', platform: 'android' })
}));
vi.mock('./companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    finalizeAttachmentRetirement: vi.fn(),
    finishAttachmentRetirement: mocks.finish,
    prepareAttachmentRetirement: mocks.prepare
  }
}));
vi.mock('./companion/runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => mocks.owner
}));

import { applyCompanionSyncObjects } from './companionSyncStateObjects.js';

let sqlite: Database.Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  installSchema();
  const port = createBetterSqliteDbPort(sqlite);
  mocks.owner = { databasePath: '/library/foliole.db', runWriter: (task) => task(port as never) };
  mocks.prepare.mockResolvedValue({ journal_token: 'journal-1' });
  mocks.finish.mockResolvedValue({});
});

afterEach(() => {
  sqlite.close();
  vi.clearAllMocks();
});

it('keeps native file verification inside the deleting database transaction', async () => {
  mocks.finish.mockImplementation(async () => {
    expect(sqlite.inTransaction).toBe(true);
    return {};
  });

  await expect(applyCompanionSyncObjects([tombstone()])).resolves.toEqual(['attachment:att-1']);

  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ library_scope: '/library/foliole.db' }));
  expect(mocks.finish).toHaveBeenCalledWith({ committed: true, journal_token: 'journal-1' });
  expect(sqlite.prepare('SELECT stage FROM attachment_retirement_obligations').get()).toEqual({ stage: 'verified' });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM attachments').get()).toEqual({ count: 0 });
});

it('restores the native journal and rolls back rows when file verification fails', async () => {
  mocks.finish.mockRejectedValueOnce(new Error('injected staging failure')).mockResolvedValueOnce({});

  await expect(applyCompanionSyncObjects([tombstone()])).rejects.toThrow('injected staging failure');

  expect(mocks.finish).toHaveBeenLastCalledWith({ committed: false, journal_token: 'journal-1' });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM attachments').get()).toEqual({ count: 1 });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM attachment_sync_tombstones').get()).toEqual({ count: 0 });
});

function tombstone() {
  const deletedAt = '2026-09-10T00:00:00.000Z';
  const payload = { attachment_id: 'att-1', content_hash: 'a'.repeat(64),
    mime_type: 'image/webp', storage_key: 'legacy-key' };
  return { content_hash: computeSyncContentHash('attachment', { ...payload, deleted_at: deletedAt }),
    deleted_at: deletedAt, object_id: 'att-1', object_type: 'attachment' as const,
    payload_json: JSON.stringify(payload), updated_at: deletedAt };
}

function installSchema() {
  sqlite.exec(`
    CREATE TABLE attachments (id TEXT PRIMARY KEY, original_name TEXT, mime_type TEXT, size_bytes INTEGER, created_at TEXT);
    CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT, mime_type TEXT);
    CREATE TABLE node_attachments (node_id TEXT, attachment_id TEXT, role TEXT);
    CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER);
    CREATE TABLE attachment_sync_tombstones (attachment_id TEXT PRIMARY KEY, content_hash TEXT, storage_key TEXT,
      mime_type TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE attachment_retirement_obligations (journal_token TEXT PRIMARY KEY, library_scope TEXT, stage TEXT,
      items_json TEXT, updated_at TEXT);
    CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, current_version_id TEXT,
      content_hash TEXT, last_modified_by_host_name TEXT, updated_at TEXT, sync_dirty INTEGER, deleted_at TEXT,
      PRIMARY KEY (object_type, object_id));
    INSERT INTO attachments VALUES ('att-1', 'wrong.webp', 'image/webp', 12, '2026-01-01T00:00:00.000Z');
    INSERT INTO attachment_blobs VALUES ('att-1', '${'a'.repeat(64)}', 'legacy-key', 'image/webp');
  `);
}
