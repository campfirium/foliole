// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createBetterSqlite3Driver } from '../../../electron/database/betterSqlite3Driver';
import { recordTopicDailyCount } from '../../../lib/core/database/reviewDailyCounts';
import { createCompanionRequestFixture } from '../../test/companionRequestSync.testSupport';

import { recordCompanionTopicDailyCount } from './companion/runtime/companionTopicDailyCounts';

it('converges mobile daily counts through request synchronization without counting a topic twice', { meta: { calibratedMs: 20000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const desktop = new Database(host.fixture.rightSnapshot.databasePath);
  try {
    for (const nodeId of ['topic-a', 'topic-b']) {
      await host.fixture.left.seed({ nodeId, content: 'Topic body', title: nodeId });
    }
    await host.sync();
    for (const nodeId of ['topic-a', 'topic-b']) {
      await host.db.transaction(tx => recordCompanionTopicDailyCount(tx, '2026-10-02', nodeId));
    }
    recordTopicDailyCount(createBetterSqlite3Driver(desktop), {
      day: '2026-10-02', nodeId: 'topic-a', hostName: 'desktop'
    });
    await host.sync();
    await host.sync();
    await host.restart();
    for (const db of [host.sqlite, desktop]) {
      expect(db.prepare('SELECT day_key, count FROM topic_daily_counts').all())
        .toEqual([{ day_key: '2026-10-02', count: 2 }]);
      expect(db.prepare('SELECT node_id FROM topic_daily_count_entries ORDER BY node_id').all())
        .toEqual([{ node_id: 'topic-a' }, { node_id: 'topic-b' }]);
    }
  } finally { desktop.close(); await host.close(); }
});
