import {
  prepareCopiedLibraryForDevice,
  type SyncDeviceCopyPreparationInput
} from '../../../../../lib/core/database/syncDeviceCopyPreparation.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';

export type CompanionDeviceCopyHost = 'android' | 'ios';

export function prepareCompanionCopiedLibraryForDevice(
  host: CompanionDeviceCopyHost,
  port: DbPort,
  input: SyncDeviceCopyPreparationInput
) {
  void host;
  return prepareCopiedLibraryForDevice(port, input);
}
