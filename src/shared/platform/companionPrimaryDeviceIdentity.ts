import {
  readStoredWebPairingState,
  writeWebPairingState
} from './companionPairingState';
import {
  FolioleCompanionSync,
  isNativeCompanionPairingRuntime
} from './companionWorkspaceRuntimeRepository';

export async function saveLocalPrimaryDeviceId(primaryDeviceId: string) {
  if (isNativeCompanionPairingRuntime()) {
    return await FolioleCompanionSync.savePrimaryDeviceId({ primary_device_id: primaryDeviceId });
  }
  const current = readStoredWebPairingState();
  if (!current) {
    throw new Error('Companion pairing state is missing.');
  }
  return writeWebPairingState({
    ...current,
    primary_device_id: primaryDeviceId
  });
}
