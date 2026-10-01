import { desktopTaskScheduler } from '../desktopTaskScheduler.js';
import type { DesktopTaskPriority } from '../desktopTaskTypes.js';

import { runWithDatabaseConnectionOwner } from './connection.js';

let sequence = 0;

export async function runDesktopDatabaseWrite<T>(priority: DesktopTaskPriority, execute: () => T | Promise<T>): Promise<T> {
  const id = `database-write:${++sequence}`;
  const handle = desktopTaskScheduler.submit({
    concurrencyKey: id,
    duplicatePolicy: 'enqueue',
    id,
    label: 'Database write',
    priority,
    resources: [{ resource: 'main-database-write' }],
    source: priority === 'foreground' ? 'foreground-storage' : 'search-invalidation-state',
    run: () => runWithDatabaseConnectionOwner(execute)
  });
  return await handle.promise as T;
}
