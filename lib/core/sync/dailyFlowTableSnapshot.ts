import { sha256 } from '@noble/hashes/sha2.js';

import { DAILY_FLOW_TABLE_BATCH_BYTES, DAILY_FLOW_TABLE_BATCH_ROWS, type DailyFlowTableRecord } from './dailyFlowTableContract.js';
import { dailyFlowTableRecords, selectDailyFlowTable } from './dailyFlowTableSource.js';
import type { DbPort } from './dbPort.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { RequestSyncFiles } from './requestSyncFiles.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

export async function writeDailyFlowTableSnapshot(db: DbPort, difference: FramedSyncInventoryDifference, files: RequestSyncFiles) {
  const selected = await selectDailyFlowTable(db, difference);
  const hash = sha256.create();
  let count = 0; let batchIndex = 0;
  const write = async (message: RequestSyncMessage) => {
    hash.update(encodeValidatedProtocolMessage(message.payloadCase, message.payload));
    await files.dailyFlow.accept(message);
  };
  await write({ payloadCase: 'daily_flow_table_begin', payload: selected.begin });
  let batch: DailyFlowTableRecord[] = [];
  let estimatedBytes = 16;
  const flush = async () => {
    if (!batch.length) return;
    await write({ payloadCase: 'daily_flow_table_batch', payload: { batchIndex: batchIndex++, records: batch } });
    count += batch.length; batch = []; estimatedBytes = 16;
  };
  for await (const record of dailyFlowTableRecords(db, selected)) {
    const size = encodeValidatedProtocolMessage('daily_flow_table_batch', { batchIndex, records: [record] }).byteLength;
    if (batch.length && estimatedBytes + size > DAILY_FLOW_TABLE_BATCH_BYTES) await flush();
    batch.push(record);
    estimatedBytes += size;
    if (batch.length === DAILY_FLOW_TABLE_BATCH_ROWS) await flush();
  }
  await flush();
  await files.dailyFlow.accept({ payloadCase: 'daily_flow_table_end', payload: {
    recordCount: count, batchCount: batchIndex, tableHash: hash.digest() } });
}
