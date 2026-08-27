import { openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import {
  buildDesktopSyncPackFromDriver,
  type BuildDesktopSyncPackInput
} from './syncPackBuilderFromDriver.js';

export { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
export type { BuildDesktopSyncPackInput } from './syncPackBuilderFromDriver.js';

export async function buildDesktopSyncPack(input: BuildDesktopSyncPackInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return runWithDatabaseConnectionOwner(() => buildDesktopSyncPackFromDriver({
    ...input, createdAt, fromPeerId: input.fromPeerId
  }, openDatabaseConnection().driver));
}
