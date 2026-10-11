import { recordTopicDailyCount } from '../../lib/core/database/reviewDailyCounts.js';
import { openDatabaseConnection } from '../database/connection.js';

import { seedCompleteInventoryFixture } from './desktopFramedSyncCompleteInventory.fixture.js';

/** Synthetic library-size workload; never reads or modifies the user's library. */
export function seedRequestSyncScaleFixture() {
  seedCompleteInventoryFixture(3800);
  const { sqlite, driver } = openDatabaseConnection();
  sqlite.transaction(() => {
    for (let index = 0; index < 24000; index++) {
      const nodeId = `t326-complete-${String(index % 3800).padStart(5, '0')}`;
      const day = `2026-10-${String(1 + Math.floor(index / 3800)).padStart(2, '0')}`;
      recordTopicDailyCount(driver, { day, nodeId, hostName: 'scale-source' });
    }
  })();
  return { nodes: 3800, dailyStates: 24000, bodyBytesPerNode: 8192 };
}
