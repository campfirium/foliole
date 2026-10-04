// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort';
import { applyStateObjectPushWithDbPort } from '../../../../../electron/database/companionSyncPushStateObjectWithDbPort';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../../../lib/core/database/companionSchemaStatements';
import { saveForegroundTime } from '../../../../../lib/core/database/foregroundTimeStore';
import { foregroundDailyTimeSyncAdapter } from '../../companionSyncPushProtocol';
import { createCompanionSyncbackDbStore } from '../sync/syncback/companionSyncbackDbStore';

import { iosCompanionContentHash, markIosCompanionMutation } from './iosCompanionMutationState';

const connections: Database.Database[] = [];
const sourceA = '11111111-1111-4111-8111-111111111111';
function instance() {
  const sql = new Database(':memory:'); connections.push(sql);
  for (const statement of COMPANION_SCHEMA_STATEMENTS) sql.exec(statement);
  return { sql, port: createBetterSqliteDbPort(sql) };
}
afterEach(() => { for (const db of connections.splice(0)) db.close(); });
async function save(db: ReturnType<typeof instance>, sourceId: string, durationMs: number) {
  await saveForegroundTime(db.port, { sourceId, buckets: [{ day: '2026-10-04', durationMs }], hash: iosCompanionContentHash,
    mark: (tx, record) => markIosCompanionMutation({ db: tx, hostName: 'mobile', objectType: 'foreground_daily_time',
      objectId: record.id, contentHash: record.hash, updatedAt: record.updatedAt }) });
}
it('pushes the real dirty stream without base-hash conflicts and does not repeat older cumulative values', async () => {
  const mobile = instance(); const desktop = instance();
  await save(mobile, sourceA, 60_000);
  const rows = await createCompanionSyncbackDbStore(mobile.port).loadStateChanges('desktop', null);
  expect(rows).toHaveLength(1);
  const first = foregroundDailyTimeSyncAdapter.buildPushPayload(rows[0]!);
  expect((await applyStateObjectPushWithDbPort(desktop.port, first, 'foreground_daily_time')).acks[0]?.status).toBe('accepted');
  await save(mobile, sourceA, 120_000);
  const second = (await createCompanionSyncbackDbStore(mobile.port).loadStateChanges('desktop', null))[0]!;
  const push = foregroundDailyTimeSyncAdapter.buildPushPayload(second);
  expect((await applyStateObjectPushWithDbPort(desktop.port, push, 'foreground_daily_time')).acks[0]?.status).toBe('accepted');
  expect((await applyStateObjectPushWithDbPort(desktop.port, first, 'foreground_daily_time')).acks[0]?.status).toBe('already_applied');
  expect(desktop.sql.prepare('SELECT duration_ms FROM foreground_daily_time').get()).toEqual({ duration_ms: 120_000 });
});
