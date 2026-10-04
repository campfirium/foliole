// @vitest-environment node

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { SYNC_IDENTITY_FACT_STAGING_SCHEMA } from '../../lib/core/database/syncIdentityFactStagingSchema.js';
import { SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS } from '../../lib/core/database/syncIdentityReceiptSchemaStatements.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { prepareSyncIdentityPackReceipt,
  recordSyncIdentityPackReceipt } from '../../lib/core/sync/syncIdentityPackReceipts.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

it('commits exact pack receipts and rejects late source views', async () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(`CREATE TABLE sync_group_local_state (singleton_id INTEGER, group_id TEXT,
      state TEXT); INSERT INTO sync_group_local_state VALUES (1, 'group', 'active');
      CREATE TABLE sync_group_devices (group_id TEXT, device_identity_key TEXT, state TEXT);
      INSERT INTO sync_group_devices VALUES ('group', 'source', 'active')`);
    for (const statement of SYNC_IDENTITY_RECEIPT_SCHEMA_STATEMENTS) sqlite.exec(statement);
    for (const statement of SYNC_IDENTITY_FACT_STAGING_SCHEMA) sqlite.exec(statement);
    const port = createBetterSqliteDbPort(sqlite);
    const first = buildSyncIdentityPackPage({ group_id: 'group', source_peer_id: 'source',
      target_peer_id: 'receiver', source_view_id: '11111111-1111-4111-8111-111111111111',
      page_index: 0, previous_page_id: null, objects: [] });
    const receipt = { page: first, packId: 'pack-1', databaseSha256: `sha256:${'a'.repeat(64)}` };
    await port.transaction(async (tx) => {
      expect((await prepareSyncIdentityPackReceipt(tx, receipt)).duplicate).toBe(false);
      await recordSyncIdentityPackReceipt(tx, receipt);
    });
    expect((await prepareSyncIdentityPackReceipt(port, receipt)).duplicate).toBe(true);
    await expect(prepareSyncIdentityPackReceipt(port, { ...receipt,
      databaseSha256: `sha256:${'b'.repeat(64)}` }))
      .rejects.toThrow('sync_identity_pack_receipt_collision');
    const second = buildSyncIdentityPackPage({ ...first, page_index: 1,
      previous_page_id: first.page_id });
    const next = { page: second, packId: 'pack-2', databaseSha256: receipt.databaseSha256 };
    await port.transaction(async (tx) => {
      await prepareSyncIdentityPackReceipt(tx, next);
      await recordSyncIdentityPackReceipt(tx, next);
    });
    const newView = buildSyncIdentityPackPage({ ...first,
      source_view_id: '22222222-2222-4222-8222-222222222222' });
    await port.transaction(async (tx) => {
      await prepareSyncIdentityPackReceipt(tx, { ...next, page: newView, packId: 'pack-3' });
      await recordSyncIdentityPackReceipt(tx, { ...next, page: newView, packId: 'pack-3' });
    });
    await expect(prepareSyncIdentityPackReceipt(port, { ...next, packId: 'pack-late' }))
      .rejects.toThrow('sync_identity_source_view_retired');
  } finally { sqlite.close(); }
});
