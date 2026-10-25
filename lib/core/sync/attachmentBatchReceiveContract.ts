import { assertAttachmentBatchQueries } from './attachmentBatchContract.js';
import type { AttachmentBlockFiles, AttachmentBlockResource } from './attachmentBlockReceiver.js';
import type { AttachmentRequest } from './requestSyncAttachmentContract.js';

export interface AttachmentBatchCandidate {
  storageKey: string;
  byteLength: number;
  offset: number;
  partialLength: number;
}
export interface AttachmentBatchDataEntry {
  storageKey: string;
  byteLength: number;
  offset: number;
  state: 'file_end' | 'range_end' | 'restart' | 'unavailable';
  blocks: number;
  pending: boolean;
}
export interface AttachmentBatchDataResult {
  entries: AttachmentBatchDataEntry[];
  bytes: number;
  blocks: number;
}
/** A bounded completion keeps its file ownership until shared publication and the SQL commit settle. */
export interface AttachmentBatchSealedFile {
  resource: AttachmentBlockResource;
  ready: Promise<void>;
  verify(): Promise<boolean>;
  publish(): Promise<void>;
  discard(): Promise<void>;
  settle(outcome: 'published' | 'failed'): Promise<void>;
  exit(): Promise<void>;
}
export interface AttachmentBatchReceiveInput {
  entries: AttachmentBatchCandidate[];
  queries: AttachmentRequest[];
  sealed(file: AttachmentBatchSealedFile): void;
}
export interface AttachmentBatchReceiveOperation {
  data: Promise<AttachmentBatchDataResult>;
  stop(): Promise<void>;
  /** Resolves only after actual data I/O and native finalizers have exited. */
  exit(): Promise<void>;
}
export interface PreparedAttachmentBatch {
  entries: readonly AttachmentBatchCandidate[];
  start(): Promise<AttachmentBatchReceiveOperation>;
  discard(): Promise<void>;
}
export type PrepareAttachmentBatch = (input: AttachmentBatchReceiveInput) => Promise<PreparedAttachmentBatch>;
export type ReceiveAttachmentBatch = (input: AttachmentBatchReceiveInput) => Promise<AttachmentBatchReceiveOperation>;
export interface AttachmentBatchHost {
  files(): Promise<AttachmentBlockFiles>;
  /** A present formal file is rehashed before an interrupted SQL update is repaired. */
  inspect(storageKey: string): Promise<{ present: boolean; length: number; verified: boolean }>;
  committed(resource: AttachmentBlockResource): Promise<void>;
  needsSlice(shouldYield: () => boolean): Promise<{ keys: string[]; pending: boolean; parsingPending?: boolean; pdfTextKeys?: string[] }>;
}

export function assertAttachmentBatchReceiveInput(input: AttachmentBatchReceiveInput) {
  assertAttachmentBatchQueries(input.queries);
  if (input.entries.length !== input.queries.length || input.entries.some((entry, index) => {
    const query = input.queries[index]!;
    return entry.storageKey !== query.storageKey || entry.offset !== query.offset || entry.byteLength !== query.byteLength ||
      !Number.isSafeInteger(entry.partialLength) || entry.partialLength < entry.offset || entry.partialLength > 8 * 1024 * 1024 * 1024;
  })) throw new Error('attachment_batch_plan_invalid');
}
