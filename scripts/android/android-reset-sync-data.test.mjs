import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { isResetConfirmed, resetSyncDataInDatabase } from './android-reset-sync-data.mjs';

let tempDir;

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('android-reset-sync-data', () => {
  it('requires an explicit device reset confirmation', () => {
    expect(isResetConfirmed({})).toBe(false);
    expect(isResetConfirmed({ FOLIOLE_ANDROID_ALLOW_SYNC_DATA_RESET: '0' })).toBe(false);
    expect(isResetConfirmed({ FOLIOLE_ANDROID_ALLOW_SYNC_DATA_RESET: '1' })).toBe(true);
  });

  it('clears synced data while preserving pairing connection metadata', async () => {
    const databasePath = await createDatabase();
    seedDatabase(databasePath);

    const result = resetSyncDataInDatabase(databasePath);

    expect(result.before.nodes).toBe(1);
    expect(result.before.syncObjectState).toBe(1);
    expect(result.after).toMatchObject({
      attachmentBlobs: 0,
      attachments: 0,
      contentBlobData: 0,
      contentBlobs: 0,
      documentSources: 0,
      externalDocuments: 0,
      nodes: 0,
      reviewLog: 0,
      settings: 0,
      syncObjectState: 0,
      syncPushAck: 0,
      workspaceMeta: 0
    });
    expect(result.after.preservedMeta).toEqual({
      device_id: 'android-device',
      workspace_sync_endpoint_url: 'http://10.0.2.2:38641',
      workspace_sync_remembered_targets: '["http://10.0.2.2:38641"]'
    });
    expect(result.after.preservedMeta.sync_pack_cursor).toBeUndefined();
    expect(result.after.preservedMeta.workspace_sync_events).toBeUndefined();
  });

  it('can rewrite emulator endpoints to adb reverse localhost for cold sync tests', async () => {
    const databasePath = await createDatabase();
    seedDatabase(databasePath);

    const result = resetSyncDataInDatabase(databasePath, { preferAdbReverse: true });

    expect(result.endpointRewrite).toEqual({
      from: 'http://10.0.2.2:38641',
      to: 'http://127.0.0.1:38641'
    });
    expect(result.after.preservedMeta.workspace_sync_endpoint_url).toBe('http://127.0.0.1:38641');
    expect(result.after.preservedMeta.workspace_sync_remembered_targets).toBe('["http://127.0.0.1:38641"]');
  });
});

async function createDatabase() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'foliole-reset-sync-data-test-'));
  const databasePath = path.join(tempDir, 'foliole-companion.db');
  const database = new Database(databasePath);
  try {
    database.exec(`
      CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT);
      CREATE TABLE sync_object_state (object_type TEXT, object_id TEXT, state_seq INTEGER, content_hash TEXT, updated_at TEXT);
      CREATE TABLE content_blobs (hash TEXT PRIMARY KEY);
      CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
      CREATE TABLE attachments (id TEXT PRIMARY KEY);
      CREATE TABLE attachment_blobs (attachment_id TEXT PRIMARY KEY);
      CREATE TABLE document_sources (source_id TEXT PRIMARY KEY);
      CREATE TABLE external_documents (document_id TEXT PRIMARY KEY);
      CREATE TABLE review_log (id TEXT PRIMARY KEY);
      CREATE TABLE setting_records (key TEXT PRIMARY KEY);
      CREATE TABLE sync_push_ack (client_op_id TEXT PRIMARY KEY);
    `);
  } finally {
    database.close();
  }
  return databasePath;
}

function seedDatabase(databasePath) {
  const database = new Database(databasePath);
  try {
    database.exec(`
      INSERT INTO companion_meta VALUES ('device_id', 'android-device', 'now');
      INSERT INTO companion_meta VALUES ('workspace_sync_endpoint_url', 'http://10.0.2.2:38641', 'now');
      INSERT INTO companion_meta VALUES ('workspace_sync_remembered_targets', '["http://10.0.2.2:38641"]', 'now');
      INSERT INTO companion_meta VALUES ('sync_pack_cursor', '188906', 'now');
      INSERT INTO companion_meta VALUES ('workspace_sync_events', '[]', 'now');
      INSERT INTO workspace_meta VALUES ('active_node_id', 'node-1', 'now');
      INSERT INTO nodes VALUES ('node-1', 'Topic');
      INSERT INTO sync_object_state VALUES ('node', 'node-1', 1, 'hash', 'now');
      INSERT INTO content_blobs VALUES ('body-hash');
      INSERT INTO content_blob_data VALUES ('body-hash', X'00');
      INSERT INTO attachments VALUES ('attachment-1');
      INSERT INTO attachment_blobs VALUES ('attachment-1');
      INSERT INTO document_sources VALUES ('source-1');
      INSERT INTO external_documents VALUES ('doc-1');
      INSERT INTO review_log VALUES ('review-1');
      INSERT INTO setting_records VALUES ('setting-1');
      INSERT INTO sync_push_ack VALUES ('op-1');
    `);
  } finally {
    database.close();
  }
}
