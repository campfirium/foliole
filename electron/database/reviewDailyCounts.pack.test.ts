// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { recordTopicDailyCount } from '../../lib/core/database/reviewDailyCounts.js';

import { closeLibraries, createPeer, joinPeers, startLibraries } from './syncLibrary.testSupport.js';
import { syncRequestLibrary } from './syncRequestLibrary.testSupport.js';

it('merges overlapping retained daily counts through repeated requests and reopening without duplication', async () => {
  await startLibraries();
  try {
    const source = createPeer('source');
    const target = createPeer('target');
    joinPeers(source, target);
    for (const nodeId of ['topic-a', 'topic-b']) recordTopicDailyCount(source.driver, {
      day: '2026-10-02', nodeId, hostName: 'source'
    });
    recordTopicDailyCount(target.driver, { day: '2026-10-02', nodeId: 'topic-a', hostName: 'target' });
    await syncRequestLibrary(source, target);
    await syncRequestLibrary(source, target);
    expect(target.db.prepare('SELECT day_key, count FROM topic_daily_counts').all())
      .toEqual([{ day_key: '2026-10-02', count: 2 }]);
    const reopened = new Database(target.file, { readonly: true });
    try {
      expect(reopened.prepare('SELECT day_key, count FROM topic_daily_counts').all())
        .toEqual([{ day_key: '2026-10-02', count: 2 }]);
    } finally { reopened.close(); }
  } finally { await closeLibraries(); }
});
