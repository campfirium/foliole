import type { MutableRefObject } from 'react';

import type { NativeCompanionPairingState } from '../../lib/platform/nativeCompanionSyncContract';

import type { PendingPairRequest } from './companionWorkspacePairingModel';
import type { CompanionPairingStatus } from './useCompanionWorkspacePairing';

export function createCancelPairingAction(args: {
  onError(message: string | null): void;
  setPairingStatus(status: CompanionPairingStatus): void;
  setPendingPairRequest(value: PendingPairRequest): void;
}) {
  return () => {
    args.setPendingPairRequest(null);
    args.setPairingStatus('idle');
    args.onError(null);
  };
}

export function createCompletePairingOnceAction(args: {
  completePairing(request: PendingPairRequest): Promise<NativeCompanionPairingState | null>;
  inFlightRef: MutableRefObject<Promise<NativeCompanionPairingState | null> | null>;
  pendingPairRequest: PendingPairRequest;
}) {
  return () => {
    if (args.inFlightRef.current) {
      return args.inFlightRef.current;
    }
    const promise = args.completePairing(args.pendingPairRequest)
      .finally(() => {
        args.inFlightRef.current = null;
      });
    args.inFlightRef.current = promise;
    return promise;
  };
}
