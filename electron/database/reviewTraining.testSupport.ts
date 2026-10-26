import { trainingEvents } from '../../lib/core/review/trainingFixture.testSupport.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import type { RestorePeer } from './requestSyncRestoreRecovery.testSupport.js';
import { seedReviewPeer } from './reviewProjection.testSupport.js';

export async function seedTrainingPeer(peer: RestorePeer, count = 2048) {
  await seedReviewPeer(peer);
  const driver = createBetterSqlite3Driver(peer.sqlite);
  driver.execute("INSERT INTO settings(key, value, updated_at) VALUES ('host_name', ?, 'now') ON CONFLICT(key) DO UPDATE SET value=excluded.value", [JSON.stringify(peer.id)]);
  driver.transaction(() => {
    driver.execute(`INSERT INTO nodes(id, kind, title, created_at, updated_at)
      VALUES ('folder', 'folder', 'Folder', 'now', 'now'), ('other', 'folder', 'Other', 'now', 'now')`);
    driver.execute("UPDATE nodes SET parent_id='folder' WHERE id='topic'");
    const nodes = new Set<string>(['topic']);
    for (const event of trainingEvents(count)) {
      if (!nodes.has(event.nodeId)) {
        nodes.add(event.nodeId);
        driver.execute(`INSERT INTO nodes(id, parent_id, kind, title, created_at, updated_at)
          VALUES (?, 'folder', 'item', 'Question', 'now', 'now')`, [event.nodeId]);
      }
      driver.execute(`INSERT INTO review_log(id, op_id, host_name, node_id, grade, scheduler_version, reviewed_at, kind, voids_op_id)
        VALUES (?, ?, 'fixture', ?, ?, '', ?, 'review', NULL)`,
      [event.opId, event.opId, event.nodeId, event.grade, event.reviewedAt]);
    }
  });
  return driver;
}
