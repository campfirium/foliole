import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type {
  NativeCompanionBootstrapPayload,
  NativeCompanionBootstrapState
} from '../../../../../lib/platform/nativeCompanionContract';

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
  nativeState: NativeCompanionBootstrapPayload,
  manager: IosCompanionDatabaseManager = new SQLiteConnection(CapacitorSQLite),
  options: IosCompanionDatabaseBootstrapOptions = {}
): Promise<NativeCompanionBootstrapState> {
  const platform = nativeState.runtime_kind === 'android-capacitor' ? 'android' : 'ios';
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  const result = await owner.open({
    allowCreate: true,
    expectedHostName: nativeState.host_name,
    now: nativeState.booted_at,
    ...(options.afterRepair ? { beforeVersionCommit: () => options.afterRepair?.(0) } : {})
  });
  activeOwner = owner;
  return {
    ...nativeState,
    database_path: result.databasePath,
    database_ready: true,
    device_id: result.deviceId,
    device_name: result.deviceId,
    host_name: result.hostName
  };
}
