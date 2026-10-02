// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver';
import { createBetterSqliteDbPort } from '../../../electron/database/betterSqliteDbPort';
import { applyStateObjectPushWithDbPort } from '../../../electron/database/companionSyncPushStateObjectWithDbPort';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../lib/core/database/companionSchemaStatements';
import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../../lib/core/database/desktopFreshSchemaStatements';
import { recordTopicDailyCount } from '../../../lib/core/database/reviewDailyCounts';

import { recordCompanionTopicDailyCount } from './companion/runtime/companionTopicDailyCounts';
import { createCompanionSyncbackDbStore } from './companion/sync/syncback/companionSyncbackDbStore';
import { topicDailyCountSyncAdapter } from './companionSyncPushProtocol';

it('pushes mobile daily counts through the real dirty-state stream and desktop receiver idempotently', async () => {
  const mobile = new Database(':memory:');
  const desktop = new Database(':memory:');
  try {
    for (const sql of COMPANION_SCHEMA_STATEMENTS) mobile.exec(sql);
    for (const sql of DESKTOP_FRESH_SCHEMA_STATEMENTS) desktop.exec(sql);
    mobile.exec(`INSERT INTO nodes(id,kind,title,created_at,updated_at) VALUES ('topic-a','topic','','2026-10-02','2026-10-02');
      INSERT INTO companion_meta(key,value,updated_at) VALUES ('host_name','mobile','2026-10-02')`);
    const mobilePort = createBetterSqliteDbPort(mobile);
    const desktopPort = createBetterSqliteDbPort(desktop);
    await mobilePort.transaction((tx) => recordCompanionTopicDailyCount(tx, '2026-10-02', 'topic-a'));
    recordTopicDailyCount(createBetterSqlite3Driver(desktop), {
      day: '2026-10-02', nodeId: 'topic-a', hostName: 'desktop'
    });
    const rows = await createCompanionSyncbackDbStore(mobilePort).loadStateChanges('desktop', null);
    expect(rows).toHaveLength(1);
    const payload = topicDailyCountSyncAdapter.buildPushPayload(rows[0]!);
    expect(payload.identity.objectType).toBe('topic_daily_count');
    for (let replay = 0; replay < 2; replay += 1) {
      const result = await applyStateObjectPushWithDbPort(desktopPort, payload, 'topic_daily_count');
      expect(result.acks[0]?.status).toBe('already_applied');
    }
    expect(desktop.prepare('SELECT day_key, count FROM topic_daily_counts').all())
      .toEqual([{ day_key: '2026-10-02', count: 1 }]);
  } finally { mobile.close(); desktop.close(); }
});
