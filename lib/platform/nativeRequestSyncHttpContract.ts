import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';

export type NativeHttpCancellation = (NativeCompanionFramedPayloadBudgetOwner & { request_id: string })
  | { request_id?: never; library_key?: never; generation_id?: never };

export interface NativeAttachmentReceivePlan {
  max_blocks: number;
  request_id_base64: string;
  storage_key: string;
  byte_length: number;
  offset: number;
  initiator_device_id: string;
  initiator_library_epoch: string;
}
/** Shared code owns scheduling and publication; native HTTP may stage authenticated attachment bytes. */
export interface NativeRequestSyncHttpRequest extends NativeCompanionFramedPayloadBudgetOwner {
  request_id: string;
  directory: string;
  request_chunk_count: number;
  url: string;
  headers: Record<string, string>;
  sync_group_id: string;
  receiver_device_id: string;
  receiver_library_epoch: string;
  peer_round_id?: string;
  attachment_receive?: NativeAttachmentReceivePlan;
  attachment_batch?: { operation_id: string };
}

export interface NativeRequestSyncHttpPlugin {
  postRequestSyncHttp(request: NativeRequestSyncHttpRequest): Promise<{
    response_chunk_count: number;
    response_byte_length: number;
    attachment_receive?: { offset: number; blocks: number; pending: boolean };
  }>;
  cancelRequestSyncHttp(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }): Promise<void>;
}
