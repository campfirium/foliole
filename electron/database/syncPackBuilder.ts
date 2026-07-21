import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import {
  buildDesktopSyncPackFromDriver,
  type BuildDesktopSyncPackInput
} from './syncPackBuilderFromDriver.js';

export { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';
export type { BuildDesktopSyncPackInput } from './syncPackBuilderFromDriver.js';

export async function buildDesktopSyncPack(input: BuildDesktopSyncPackInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return buildDesktopSyncPackFromDriver({
    ...input,
    createdAt,
    fromDeviceId: input.fromDeviceId ?? loadOrCreateDesktopDeviceId(createdAt)
  }, openDatabaseConnection().driver);
}
