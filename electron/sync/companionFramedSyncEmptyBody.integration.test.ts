// @vitest-environment node
import { expect, it } from 'vitest';

import type { DbPort, DbRow } from '../../lib/core/sync/dbPort.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { applyVerifiedCompanionFramedSyncTransfer } from '../../src/shared/platform/companion/sync/framed/companionFramedSyncVerifiedApply.js';

import { verifiedCompanionFixture } from './companionFramedSyncVerifiedApply.testSupport.js';

// Capacitor SQLite on iOS exposes sqlite3_column_blob's zero-length pointer as null.
function iosEmptyBlobProjection(db: DbPort): DbPort {
  return {
    run: (sql, params) => db.run(sql, params),
    async query<T extends DbRow>(sql: string, params?: Parameters<DbPort['query']>[1]): Promise<T[]> {
      const rows = await db.query<T>(sql, params);
      return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, value instanceof Uint8Array && value.byteLength === 0 ? null : value])) as T);
    },
    transaction: (execute) => db.transaction((tx) => execute(iosEmptyBlobProjection(tx)))
  };
}

it('applies and replays genuine empty iOS BLOB bodies with durable version identity', async () => {
  const host = await verifiedCompanionFixture('ios', '');
  try {
    expect(host.native.prepare(`SELECT typeof(data) AS kind, length(data) AS size
      FROM ${host.prefix}_available_blobs`).get()).toEqual({ kind: 'blob', size: 0 });
    const receipt = await applyVerifiedCompanionFramedSyncTransfer(iosEmptyBlobProjection(host.port()), host.input);
    host.reopen();
    expect((await loadCurrentSyncNodeRecord(host.port(), 'node-1'))?.body_text).toBe('');
    expect(host.main.prepare('SELECT current_version_id FROM nodes').pluck().get()).toBe('version-1');
    expect(await applyVerifiedCompanionFramedSyncTransfer(iosEmptyBlobProjection(host.port()), host.input)).toEqual(receipt);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(1);
  } finally { host.close(); }
});

it.each(['missing', 'text', 'nonempty'] as const)('rejects %s storage instead of fabricating an empty iOS body', async (failure) => {
  const host = await verifiedCompanionFixture('ios', '');
  try {
    if (failure === 'missing') host.native.exec(`DELETE FROM ${host.prefix}_available_blobs`);
    else host.native.prepare(`UPDATE ${host.prefix}_available_blobs SET data = ?`)
      .run(failure === 'text' ? '' : Buffer.from('x'));
    await expect(applyVerifiedCompanionFramedSyncTransfer(iosEmptyBlobProjection(host.port()), host.input)).rejects.toThrow();
    expect(host.main.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
    expect(host.main.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
  } finally { host.close(); }
});
