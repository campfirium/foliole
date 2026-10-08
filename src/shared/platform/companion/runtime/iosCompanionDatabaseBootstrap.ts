import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

import type {
  NativeCompanionBootstrapPayload,
  NativeCompanionBootstrapState
} from '../../../../../lib/platform/nativeCompanionContract';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';
import { invalidateCompanionReadingScope } from '../reading/companionReadingScope';

import {
  CapacitorCompanionDatabaseOwner,
  type CapacitorCompanionDatabaseManager
} from './capacitorCompanionDatabaseOwner';
import { stopCompanionForegroundTime } from './companionForegroundTime';
import { closeCompanionFramedPayloadBudget, configureCompanionFramedPayloadBudget } from './companionFramedPayloadBudget';

export type IosCompanionDatabaseManager = CapacitorCompanionDatabaseManager;

export interface IosCompanionDatabaseBootstrapOptions {
  afterRepair?: (index: number) => void | Promise<void>;
}

let activeOwner: CapacitorCompanionDatabaseOwner | null = null;
let lifecycleTail: Promise<void> = Promise.resolve();

export function getIosCompanionDatabaseOwner() {
  if (!activeOwner) throw new Error('iOS companion database owner is not ready.');
  return activeOwner;
}

export function closeIosCompanionDatabase() {
  return enqueueLifecycle(closeActiveDatabase);
}

async function closeActiveDatabase() {
  const owner = activeOwner;
  if (owner) await closeCompanionFramedPayloadBudget(owner);
  await stopCompanionForegroundTime();
  if (activeOwner === owner) activeOwner = null;
  invalidateCompanionReadingScope();
  await owner?.close();
}

export function initializeIosCompanionDatabase(
  nativeState: NativeCompanionBootstrapPayload,
  manager: IosCompanionDatabaseManager = new SQLiteConnection(CapacitorSQLite),
  options: IosCompanionDatabaseBootstrapOptions = {}
): Promise<NativeCompanionBootstrapState> {
  return enqueueLifecycle(async () => {
    await closeActiveDatabase();
    return initializeDatabase(nativeState, manager, options);
  });
}

async function initializeDatabase(
  nativeState: NativeCompanionBootstrapPayload,
  manager: IosCompanionDatabaseManager,
  options: IosCompanionDatabaseBootstrapOptions
): Promise<NativeCompanionBootstrapState> {
  const platform = nativeState.runtime_kind === 'android-capacitor' ? 'android' : 'ios';
  const owner = new CapacitorCompanionDatabaseOwner(manager, platform);
  const result = await owner.open({
    allowCreate: true,
    inventoryResourceStorageKeys: async () => {
      const results = await Promise.all([false, true].map((trash) =>
        FolioleCompanionSync.maintainAttachmentFiles({ operation: 'inventory', trash })));
      if (results.some((result) => !result.files)) throw new Error('attachment_inventory_missing');
      return results.flatMap((result) => result.files!.map((file) => file.storageKey));
    },
    expectedHostName: nativeState.host_name,
    now: nativeState.booted_at,
    ...(options.afterRepair ? { beforeVersionCommit: () => options.afterRepair?.(0) } : {})
  });
  try {
    await configureCompanionFramedPayloadBudget(owner);
  } catch (error) {
    await owner.close();
    throw error;
  }
  activeOwner = owner;
  invalidateCompanionReadingScope();
  return {
    ...nativeState,
    database_path: result.databasePath,
    database_ready: true,
    device_id: result.deviceId,
    device_name: result.deviceId,
    host_name: result.hostName
  };
}

function enqueueLifecycle<T>(task: () => Promise<T>) {
  const result = lifecycleTail.then(task);
  lifecycleTail = result.then(() => undefined, () => undefined);
  return result;
}
