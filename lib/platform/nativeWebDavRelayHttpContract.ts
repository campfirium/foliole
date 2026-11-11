import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';
import type { WebDavRelayBinding } from './webDavRelayContract.js';

export type NativeWebDavRelayCredentialReference = {
  binding_id: string;
  group_id: string;
  desktop_device_id: string;
  phone_device_id: string;
  library_epoch: string;
  version: string;
};

export function webDavRelayCredentialReference(binding: WebDavRelayBinding, libraryEpoch: string):
  NativeWebDavRelayCredentialReference | undefined {
  if (binding.credential_version === undefined) return undefined;
  return {
    binding_id: binding.id, group_id: binding.group_id, desktop_device_id: binding.desktop_device_id,
    phone_device_id: binding.phone_device_id, library_epoch: libraryEpoch, version: String(binding.credential_version)
  };
}

export type NativeWebDavRelayHttpRequest = NativeCompanionFramedPayloadBudgetOwner & {
  request_id: string;
  root: string;
  url: string;
  method: 'DELETE' | 'GET' | 'MKCOL' | 'MOVE' | 'PROPFIND' | 'PUT';
  depth?: string;
  upload_directory?: string;
  upload_chunks?: number;
  upload_bytes?: string;
  credential?: NativeWebDavRelayCredentialReference;
};

export interface NativeWebDavRelayHttpPlugin {
  requestWebDavRelay(request: NativeWebDavRelayHttpRequest): Promise<{
    status: number; chunks: number; uploaded_bytes: number; downloaded_bytes: number; failed: boolean; failure_code?: string; retry_after?: string;
  }>;
  cancelWebDavRelay(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }): Promise<void>;
}
