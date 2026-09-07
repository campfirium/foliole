import {
  normalizeReadwiseHostSettings,
  READWISE_HOST_SETTINGS_KEY,
  type ReadwiseHostSettings
} from '../../lib/core/import/readwiseHostSettings.js';
import type { NativeReadwiseApiConnection } from '../../lib/platform/nativeReadwiseApiConnectionContract.js';
import { loadJsonSetting } from '../database/settingsStore.js';

import { hasReadwiseApiSecret, readReadwiseApiSecret } from './readwiseApiSecret.js';

export function loadStoredReadwiseHostSettings() {
  return normalizeReadwiseHostSettings(loadJsonSetting(READWISE_HOST_SETTINGS_KEY));
}

export function toPublicReadwiseApiConnection(
  settings: ReadwiseHostSettings = loadStoredReadwiseHostSettings()
): NativeReadwiseApiConnection {
  const secretRef = settings.apiConnection.secretRef;
  if (settings.apiConnection.state === 'disconnected' || !secretRef) {
    return { has_credential: false, state: settings.apiConnection.state, verified_at: settings.apiConnection.verifiedAt };
  }
  try {
    if (!hasReadwiseApiSecret(secretRef) || !readReadwiseApiSecret(secretRef)) {
      return { has_credential: false, state: 'secure_storage_unavailable', verified_at: settings.apiConnection.verifiedAt };
    }
    return {
      has_credential: true,
      state: settings.apiConnection.state,
      verified_at: settings.apiConnection.verifiedAt
    };
  } catch {
    return { has_credential: true, state: 'secure_storage_unavailable', verified_at: settings.apiConnection.verifiedAt };
  }
}

export function isStoredReadwiseApiConnectionReady() {
  const connection = toPublicReadwiseApiConnection();
  return connection.state === 'connected' && connection.has_credential;
}
