import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type { NativeCompanionBootstrapState } from '../../../../../lib/platform/nativeCompanionContract';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';

export type IosCompanionDatabaseManager = CapacitorCompanionDatabaseManager;

export interface IosCompanionDatabaseBootstrapOptions {
  afterRepair?: (index: number) => void | Promise<void>;
  resetCredentials?: (runtimeKind: NativeCompanionBootstrapState['runtime_kind']) => Promise<void>;
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
  if (result.credentialResetPending) {
    await (options.resetCredentials ?? resetNativeCredentials)(nativeState.runtime_kind);
    await owner.acknowledgeDeviceProfileReset(result.deviceId);
  }
  return {
    ...nativeState,
    database_path: result.databasePath,
    database_ready: true,
    device_id: result.deviceId
  };
}

async function resetNativeCredentials(runtimeKind: NativeCompanionBootstrapState['runtime_kind']) {
  const { FolioleCompanionSync } = await import('../../companionWorkspaceRuntimeRepository');
  if (runtimeKind === 'android-capacitor') await FolioleCompanionSync.clearSyncGroupCredentials();
  else if (runtimeKind === 'ios-capacitor') await FolioleCompanionSync.clearPairingCredentials();
}
