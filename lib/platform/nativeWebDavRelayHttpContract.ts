import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';

export type NativeWebDavRelayHttpRequest = NativeCompanionFramedPayloadBudgetOwner & {
  request_id: string;
  root: string;
  url: string;
  method: 'GET' | 'MKCOL' | 'MOVE' | 'PROPFIND' | 'PUT';
  depth?: string;
  upload_directory?: string;
  upload_chunks?: number;
  upload_bytes?: string;
};

export interface NativeWebDavRelayHttpPlugin {
  requestWebDavRelay(request: NativeWebDavRelayHttpRequest): Promise<{
    status: number; chunks: number; uploaded_bytes: number; downloaded_bytes: number; failed: boolean;
  }>;
  cancelWebDavRelay(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }): Promise<void>;
}
