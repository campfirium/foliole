import type { NativeCompanionFramedPayloadBudgetOwner } from './nativeCompanionFramedPayloadBudgetContract.js';

export const ATTACHMENT_COMPLETION_SLOTS = 4;
export const ATTACHMENT_BATCH_EVENT = 'attachmentBatchChanged';

export interface NativeAttachmentBatchIdentity extends NativeCompanionFramedPayloadBudgetOwner {
  operation_id: string;
}
export interface NativeAttachmentBatchEntry {
  storage_key: string;
  /** Zero means no trusted length has been authenticated yet. */
  byte_length: number;
  offset: number;
  partial_length: number;
}
export interface NativeAttachmentBatchContext {
  sync_group_id: string;
  initiator_device_id: string;
  initiator_library_epoch: string;
  receiver_device_id: string;
  receiver_library_epoch: string;
}
export type NativeAttachmentBatchCommand = NativeAttachmentBatchIdentity & (
  | { action: 'open'; request_id_base64: string; entries: NativeAttachmentBatchEntry[]; context: NativeAttachmentBatchContext }
  | { action: 'read' | 'stop' | 'wait_exit' | 'dispose' }
  | { action: 'claim'; sequences: number[] }
  | { action: 'verify' | 'publish' | 'discard'; sequence: number }
  | { action: 'settle'; sequence: number; outcome: 'published' | 'failed' }
);
export interface NativeAttachmentSealedFile {
  sequence: number;
  storage_key: string;
  byte_length: number;
  state: 'sealed' | 'claimed';
}
export interface NativeAttachmentBatchDataEntry {
  storage_key: string;
  byte_length: number;
  offset: number;
  state: 'file_end' | 'range_end' | 'restart' | 'unavailable';
  blocks: number;
  pending: boolean;
}
export interface NativeAttachmentBatchDataResult {
  entries: NativeAttachmentBatchDataEntry[];
  bytes: number;
  blocks: number;
}

type NativeAttachmentBatchSnapshotBase = NativeAttachmentBatchIdentity & {
  files: NativeAttachmentSealedFile[];
  settlements: Array<{ sequence: number; outcome: 'published' | 'failed' }>;
  capacity: typeof ATTACHMENT_COMPLETION_SLOTS;
  active_operations: number;
};
export type NativeAttachmentBatchSnapshot = NativeAttachmentBatchSnapshotBase & (
  | { state: 'prepared' | 'receiving' }
  | { state: 'data_complete'; result: NativeAttachmentBatchDataResult }
  | { state: 'data_failed' | 'stopped'; error: string }
  | { state: 'closed'; outcome: 'complete'; result: NativeAttachmentBatchDataResult }
  | { state: 'closed'; outcome: 'failed' | 'stopped'; error: string }
);

/** Notifications only wake the consumer; read/claim/settle operate on retained native facts. */
export interface NativeAttachmentBatchPlugin {
  attachmentBatch(command: NativeAttachmentBatchCommand): Promise<unknown>;
}
