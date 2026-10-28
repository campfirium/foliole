import { expect } from 'vitest';

import { openDailyFlow } from '../../lib/core/flow/dailyFlowService.js';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../lib/core/review/settings.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { desktopDailyFlowPersistence } from '../database/dailyFlow.js';
import { prepareDesktopNodeIndex, readDesktopNodeIndex } from '../database/desktopNodeIndex.js';

export function prepareDesktopFlowIndexForSync() {
  return runWithDatabaseConnectionOwner(() => {
    const { sqlite } = openDatabaseConnection();
    sqlite.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('host_name','index-sync',?) ON CONFLICT(key) DO NOTHING")
      .run(new Date().toISOString());
    prepareDesktopNodeIndex(sqlite, DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue.defaultPriority);
  });
}

export function assertDesktopFlowIndexAfterSync(expected: string[]) {
  return runWithDatabaseConnectionOwner(async () => {
    const { sqlite } = openDatabaseConnection();
    // The committed SQL changes make the old view unavailable before any display refresh.
    expect(readDesktopNodeIndex(sqlite)).toBeNull();
    const index = prepareDesktopNodeIndex(sqlite, DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue.defaultPriority);
    expect([...index.metadata.keys()].sort()).toEqual([...expected].sort());
    sqlite.exec('DELETE FROM daily_flow_state; DELETE FROM daily_flow_entries; DELETE FROM daily_flow_operations');
    await openDailyFlow(createBetterSqliteDbPort(sqlite), { now: new Date().toISOString(), mode: 'recommended', prepareOnly: true },
      { newDayStartsAtHour: 4, pushQueue: DEFAULT_REVIEW_SCHEDULER_SETTINGS.pushQueue }, desktopDailyFlowPersistence);
    expect((sqlite.prepare('SELECT node_id FROM daily_flow_entries ORDER BY node_id').all() as { node_id: string }[])
      .map(row => row.node_id)).toEqual([...expected].sort());
  });
}
