import { sha256 } from '@noble/hashes/sha2.js';

import { dailyFlowTableBatchSchema, dailyFlowTableBeginSchema, dailyFlowTableEndSchema,
  DAILY_FLOW_TABLE_BATCH_BYTES, type DailyFlowTableBegin, type DailyFlowTableRecord } from './dailyFlowTableContract.js';
import { FRAMED_SYNC_FRAME_TYPES } from './framedSyncContract.js';
import { decodeAndValidateProtocolMessage, encodeValidatedProtocolMessage, type ValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

/** Owned by the existing request scratch lifetime, never a durable snapshot store. */
export class DailyFlowTableFiles {
  begin: DailyFlowTableBegin | undefined;
  complete = false;
  private next = 0;
  private count = 0;
  private readonly hash = sha256.create();

  constructor(private readonly write: (key: string, bytes: Uint8Array) => Promise<void>,
    private readonly read: (key: string) => Uint8Array | null | undefined | Promise<Uint8Array | null | undefined>) {}

  async accept(message: ValidatedProtocolMessage | RequestSyncMessage) {
    const encoded = encodeValidatedProtocolMessage(message.payloadCase, message.payload);
    if (this.complete || encoded.byteLength > DAILY_FLOW_TABLE_BATCH_BYTES) throw new Error('daily_flow_table_frame_invalid');
    if (message.payloadCase === 'daily_flow_table_begin') {
      if (this.begin) throw new Error('daily_flow_table_begin_duplicate');
      this.begin = dailyFlowTableBeginSchema.parse(message.payload);
    } else if (message.payloadCase === 'daily_flow_table_batch') {
      if (!this.begin) throw new Error('daily_flow_table_begin_missing');
      const batch = dailyFlowTableBatchSchema.parse(message.payload);
      if (batch.batchIndex !== this.next - 1) throw new Error('daily_flow_table_sequence_invalid');
      this.count += batch.records.length;
    } else if (message.payloadCase === 'daily_flow_table_end') {
      const end = dailyFlowTableEndSchema.parse(message.payload);
      if (!this.begin || end.batchCount !== this.next - 1 || end.recordCount !== this.count ||
          !this.hash.digest().every((value, index) => value === end.tableHash[index])) {
        throw new Error('daily_flow_table_incomplete');
      }
      this.complete = true;
    } else throw new Error('daily_flow_table_message_invalid');
    await this.write(`table-${this.next++}`, encoded);
    if (!this.complete) this.hash.update(encoded);
  }

  async *messages(): AsyncGenerator<RequestSyncMessage> {
    if (!this.complete) throw new Error('daily_flow_table_incomplete');
    for (let index = 0; index < this.next; index++) {
      const bytes = await this.read(`table-${index}`);
      if (!bytes) throw new Error('daily_flow_table_file_missing');
      yield decodeAndValidateProtocolMessage(bytes, FRAMED_SYNC_FRAME_TYPES.sessionControl);
    }
  }

  async *records(): AsyncGenerator<DailyFlowTableRecord> {
    for await (const message of this.messages()) {
      if (message.payloadCase === 'daily_flow_table_batch') {
        yield* dailyFlowTableBatchSchema.parse(message.payload).records;
      }
    }
  }
}
