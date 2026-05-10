import type { NativeCredentialBagResponse } from '../../lib/platform/nativeCompanionSyncContract.js';
import { loadReadwiseTokenSecretForCredentialBag } from '../readwise/readwiseTokenConnector.js';

import { encryptCredentialBag } from './companionCredentialBagCrypto.js';
import { loadPairedCompanionDevice } from './companionPairingStore.js';

export const READWISE_CREDENTIAL_BAG_PATH = '/companion/credentials/readwise-token';

export function loadReadwiseCredentialBag(authenticatedDeviceId: string): NativeCredentialBagResponse {
  const pairedDevice = loadPairedCompanionDevice(authenticatedDeviceId);
  const token = loadReadwiseTokenSecretForCredentialBag();
  if (!pairedDevice || !token) {
    return { credential: null, status: 'not_available' };
  }
  return {
    credential: encryptCredentialBag({
      deviceSecret: pairedDevice.device_secret,
      plaintext: token,
      service: 'readwise_token'
    }),
    status: 'ready'
  };
}
