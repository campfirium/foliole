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
export interface NativeAttachmentBatchReceivePlan {
  initiator_device_id: string;
  initiator_library_epoch: string;
  members: Omit<NativeAttachmentReceivePlan, 'initiator_device_id' | 'initiator_library_epoch'>[];
}
export interface NativeAttachmentBatchMember {
  index: number;
  offset: number;
  blocks: number;
  pending: boolean;
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
  attachment_batch_receive?: NativeAttachmentBatchReceivePlan;
}

export interface NativeRequestSyncHttpPlugin {
  postRequestSyncHttp(request: NativeRequestSyncHttpRequest): Promise<{
    response_chunk_count: number;
    response_byte_length: number;
    attachment_receive?: { offset: number; blocks: number; pending: boolean };
    attachment_batch_member?: NativeAttachmentBatchMember;
  }>;
  readRequestSyncAttachmentBatch(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }):
    Promise<{ attachment_batch_member: NativeAttachmentBatchMember }>;
  cancelRequestSyncHttp(request: NativeCompanionFramedPayloadBudgetOwner & { request_id: string }): Promise<void>;
}
