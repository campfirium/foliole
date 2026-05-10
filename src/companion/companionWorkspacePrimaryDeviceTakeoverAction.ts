import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';
import { requestPrimaryDeviceTakeover } from '../shared/platform/companionPrimaryDeviceTakeover';
import { loadCompanionPairingState } from '../shared/platform/companionWorkspaceSync';

export function createPrimaryDeviceTakeoverAction(args: {
  commitPairingState(state: NativeCompanionPairingState): void;
  onError(message: string | null): void;
}) {
  return async (endpointUrl: string) => {
    args.onError(null);
    const response = await requestPrimaryDeviceTakeover(endpointUrl)
      .catch((error) => {
        args.onError(error instanceof Error ? error.message : 'Failed to set this device as primary.');
        throw error;
      });
    args.commitPairingState(await loadCompanionPairingState());
    return response;
  };
}
