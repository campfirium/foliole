import type {
  NativeCredentialBagPayload,
  NativeCredentialBagResponse
} from '../../../lib/platform/nativeCompanionSyncContract';
import type { NativeReadwiseTokenConnection } from '../../../lib/platform/nativeReadwiseContract';

import { fetchDesktopJson } from './companionDesktopSyncHttp';
import { FolioleCompanionSync, isNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';

export const READWISE_CREDENTIAL_BAG_PATH = '/companion/credentials/readwise-token';

function isCredentialBagPayload(value: unknown): value is NativeCredentialBagPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return payload.algorithm === 'HKDF-SHA256-AES-GCM' &&
    payload.service === 'readwise_token' &&
    typeof payload.ciphertext === 'string' &&
    typeof payload.exported_at === 'string' &&
    typeof payload.iv === 'string' &&
    typeof payload.salt === 'string';
}

function isCredentialBagResponse(value: unknown): value is NativeCredentialBagResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (payload.status === 'not_available' && payload.credential === null) ||
    (payload.status === 'ready' && isCredentialBagPayload(payload.credential));
}

export async function syncReadwiseCredentialBagFromDesktop(endpointUrl: string): Promise<NativeReadwiseTokenConnection | null> {
  if (!isNativeAndroidCompanionRuntime()) {
    return null;
  }
  const response = await fetchDesktopJson<unknown>(endpointUrl, READWISE_CREDENTIAL_BAG_PATH);
  if (!isCredentialBagResponse(response) || response.status !== 'ready' || !response.credential) {
    return null;
  }
  return await FolioleCompanionSync.saveReadwiseCredentialBag(response.credential);
}
