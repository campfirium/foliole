import fs from 'node:fs';

import { shell } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { resolveFolioleAideRuntimePaths } from '../assistant/folioleAideRuntime.js';
import { inventoryFolioleAideStorage } from '../assistant/folioleAideStorageInventory.js';

import { resolveAppPaths } from './paths.js';

function resolveAideDeviceDataRoot() {
  const appDataPath = resolveAppPaths().app_data_dir;
  return resolveFolioleAideRuntimePaths(appDataPath, appDataPath).deviceDataRoot;
}

export function handleAssistantStorageCommand(command: string) {
  if (command === NATIVE_COMMANDS.assistantGetStorageInfo) {
    return inventoryFolioleAideStorage(resolveAideDeviceDataRoot());
  }
  if (command === NATIVE_COMMANDS.assistantOpenStorageLocation) {
    return openAssistantStorageLocation();
  }
  return undefined;
}

async function openAssistantStorageLocation() {
  const rootPath = resolveAideDeviceDataRoot();
  fs.mkdirSync(rootPath, { recursive: true });
  const error = await shell.openPath(rootPath);
  if (error) throw new Error('assistant_storage_location_open_failed');
  return null;
}
