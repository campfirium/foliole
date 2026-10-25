import { AttachmentBatchBudget, assertAttachmentBatchQueries } from './attachmentBatchContract.js';
import { ATTACHMENT_BLOCK_BYTES, type AttachmentBlockResource } from './attachmentBlockReceiver.js';
import type { AttachmentRequest } from './requestSyncAttachmentContract.js';

export type AttachmentBatchEvent =
  | { kind: 'description'; resource: AttachmentBlockResource; offset: number }
  | { kind: 'block'; resource: AttachmentBlockResource; offset: number; data: Uint8Array }
  | { kind: 'file_end' | 'range_end'; resource: AttachmentBlockResource; offset: number }
  | { kind: 'restart'; storageKey: string; byteLength: number; offset: number }
  | { kind: 'unavailable'; storageKey: string; pending: boolean }
  | { kind: 'batch_end'; bytes: number; entries: number };

type Receiving = { resource: AttachmentBlockResource; offset: number };

/** A description narrows one preauthorized entry; only an independent file end permits sealing it. */
export class AttachmentBatchResponse {
  private readonly budget = new AttachmentBatchBudget();
  private current: Receiving | undefined;
  private index = 0;
  private rangeEnded = false;
  private ended = false;

  constructor(private readonly queries: readonly AttachmentRequest[]) { assertAttachmentBatchQueries(queries); }

  accept(value: AttachmentRequest, encodedBytes: number): AttachmentBatchEvent {
    const first = this.queries[0]!;
    if (this.ended || value.operation !== 'batch_pull' ||
        !value.requestId.every((byte, index) => byte === first.requestId[index]) ||
        value.storageKeys.length || value.derive || value.extractorVersion || value.parsingPending) throw invalid();
    this.budget.account(value, encodedBytes);
    if (value.state === 'batch_end') return this.end(value);
    if (this.rangeEnded) throw invalid();
    const query = this.queries[this.index];
    if (!query || value.storageKey !== query.storageKey) throw invalid();
    if (this.current) return this.receive(value);
    if (value.data.length || value.offset !== query.offset) throw invalid();
    if (value.state === 'unavailable') {
      if (value.byteLength !== query.byteLength) throw invalid();
      this.index++;
      return { kind: 'unavailable', storageKey: query.storageKey, pending: value.pending };
    }
    if (value.pending || (query.byteLength && value.byteLength !== query.byteLength)) throw invalid();
    if (value.state === 'restart') {
      if (value.byteLength >= query.offset) throw invalid();
      this.index++;
      return { kind: 'restart', storageKey: query.storageKey, byteLength: value.byteLength, offset: query.offset };
    }
    if (value.state !== 'description' || query.offset > value.byteLength) throw invalid();
    const resource = { storageKey: query.storageKey, byteLength: value.byteLength };
    this.current = { resource, offset: query.offset };
    return { kind: 'description', resource, offset: query.offset };
  }

  finish() { if (!this.ended) throw new Error('attachment_batch_incomplete'); }

  private receive(value: AttachmentRequest): AttachmentBatchEvent {
    const current = this.current!;
    if (value.pending || value.byteLength !== current.resource.byteLength || value.offset !== current.offset) throw invalid();
    if (value.state === 'block') {
      const length = Math.min(ATTACHMENT_BLOCK_BYTES, current.resource.byteLength - current.offset);
      if (!length || value.data.length !== length) throw invalid();
      current.offset += length;
      return { kind: 'block', resource: current.resource, offset: value.offset, data: value.data };
    }
    if (value.data.length) throw invalid();
    if (value.state === 'file_end') {
      if (current.offset !== current.resource.byteLength) throw invalid();
    } else if (value.state === 'range_end') {
      if (current.offset >= current.resource.byteLength) throw invalid();
      this.rangeEnded = true;
    } else throw invalid();
    this.current = undefined;
    this.index++;
    return { kind: value.state, resource: current.resource, offset: current.offset };
  }

  private end(value: AttachmentRequest): AttachmentBatchEvent {
    if (this.current || !this.index || value.storageKey || value.data.length || value.byteLength || value.pending ||
        value.offset !== this.budget.payloadBytes) throw invalid();
    this.ended = true;
    return { kind: 'batch_end', bytes: this.budget.payloadBytes, entries: this.index };
  }
}

function invalid() { return new Error('attachment_batch_response_invalid'); }
