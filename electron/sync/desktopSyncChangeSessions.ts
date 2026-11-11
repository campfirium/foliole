import { randomUUID } from 'node:crypto';

import { createSyncChangeSessions } from '../../lib/core/sync/syncChangeSessions.js';
import { registerDatabaseConnectionCleanup } from '../database/connection.js';

import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';

let current: ReturnType<typeof createSyncChangeSessions> | undefined;

export function desktopSyncChangeSessions() {
  if (!current) {
    current = createSyncChangeSessions(randomUUID(), randomUUID, notifyDesktopSyncGroupOverviewChanged);
    registerDatabaseConnectionCleanup(closeDesktopSyncChangeSessions);
  }
  return current;
}

export function closeDesktopSyncChangeSessions() {
  current?.closeAll();
  current = undefined;
}
