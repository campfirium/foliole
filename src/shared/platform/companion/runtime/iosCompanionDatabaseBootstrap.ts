import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type { NativeCompanionBootstrapState } from '../../../../../lib/platform/nativeCompanionContract';
import { clearCompanionAppData } from '../../companionAppData';
import { recoverInterruptedCompanionSyncGroupProvisioning } from '../sync/syncGroupStore';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';

export type IosCompanionDatabaseManager = CapacitorCompanionDatabaseManager;

export interface IosCompanionDatabaseBootstrapOptions {
  afterRepair?: (index: number) => void | Promise<void>;
}

let activeOwner: CapacitorCompanionDatabaseOwner | null = null;

export function getIosCompanionDatabaseOwner() {
  if (!activeOwner) throw new Error('iOS companion database owner is not ready.');
  return activeOwner;
}

export async function closeIosCompanionDatabase() {
  const owner = activeOwner;
  activeOwner = null;
  await owner?.close();
}

export async function initializeIosCompanionDatabase(
  nativeState: NativeCompanionBootstrapState,
  manager: IosCompanionDatabaseManager = new SQLiteConnection(CapacitorSQLite),
  options: IosCompanionDatabaseBootstrapOptions = {}
): Promise<NativeCompanionBootstrapState> {
  const platform = nativeState.runtime_kind === 'android-capacitor' ? 'android' : 'ios';
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  const result = await owner.open({
    allowCreate: true,
    expectedDeviceId: nativeState.device_id,
    now: nativeState.booted_at,
    ...(options.afterRepair ? { beforeVersionCommit: () => options.afterRepair?.(0) } : {})
  });
  activeOwner = owner;
  if (await recoverInterruptedCompanionSyncGroupProvisioning()) {
    await clearCompanionAppData();
  }
  return {
    ...nativeState,
    database_path: result.databasePath,
    database_ready: true,
    device_id: result.deviceId
  };
}
