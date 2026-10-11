import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';

/** Native HTTP moves request-owned byte chunks; shared code owns framing, encryption and business apply. */
export interface NativeRequestSyncHttpRequest extends NativeCompanionFramedPayloadBudgetOwner {
  request_id: string;
  directory: string;
  request_chunk_count: number;
  url: string;
  headers: Record<string, string>;
  sync_group_id: string;
  receiver_device_id: string;
  receiver_library_epoch: string;
}

export interface NativeRequestSyncHttpPlugin {
  postRequestSyncHttp(request: NativeRequestSyncHttpRequest): Promise<{
    response_chunk_count: number;
    response_byte_length: number;
  }>;
  cancelRequestSyncHttp(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }): Promise<void>;
}
