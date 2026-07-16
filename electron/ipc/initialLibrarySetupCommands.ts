import type { BrowserWindow } from 'electron';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import {
  chooseInitialLibraryLocation,
  confirmInitialLibrarySetup,
  loadInitialLibrarySetup
} from '../initialLibrarySetup.js';

import type { InvokeRequest } from './contracts.js';

export function handleInitialLibrarySetupCommand(
  request: InvokeRequest,
  window: BrowserWindow | null
) {
  if (request.command === NATIVE_COMMANDS.loadInitialLibrarySetup) {
    return loadInitialLibrarySetup();
  }
  if (request.command === NATIVE_COMMANDS.chooseInitialLibraryLocation) {
    return chooseInitialLibraryLocation(window);
  }
  if (request.command === NATIVE_COMMANDS.confirmInitialLibrarySetup) {
    return confirmInitialLibrarySetup(window);
  }
  return undefined;
}
