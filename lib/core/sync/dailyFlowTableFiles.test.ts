// @vitest-environment node
import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { DailyFlowTableFiles } from './dailyFlowTableFiles.js';
import { encodeValidatedProtocolMessage } from './framedSyncProtocolCodec.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';

const begin: RequestSyncMessage = { payloadCase: 'daily_flow_table_begin', payload: {
  listId: 'list', purpose: 'current_table', snapshotId: 'snapshot', requestedFactId: 'list', headId: 'list',
  sessionJson: '{}', mode: 'recommended', memberCount: 0, factCount: 0
} };
const batch: RequestSyncMessage = { payloadCase: 'daily_flow_table_batch', payload: {
  batchIndex: 0, records: [{ appliedFactId: 'list' }]
} };
const hash = sha256.create().update(encodeValidatedProtocolMessage(begin.payloadCase, begin.payload))
  .update(encodeValidatedProtocolMessage(batch.payloadCase, batch.payload)).digest();
const end: RequestSyncMessage = { payloadCase: 'daily_flow_table_end', payload: { batchCount: 1, recordCount: 1, tableHash: hash } };

function stage() {
  const storage = new Map<string, Uint8Array>();
  return new DailyFlowTableFiles(async (key, data) => { storage.set(key, data); }, key => storage.get(key));
}

it('exposes records only after every ordered batch and the matching final digest arrives', async () => {
  const files = stage();
  await files.accept(begin);
  await expect(files.records().next()).rejects.toThrow('daily_flow_table_incomplete');
  await files.accept(batch);
  await expect(files.records().next()).rejects.toThrow('daily_flow_table_incomplete');
  await files.accept(end);
  expect((await files.records().next()).value).toMatchObject({ appliedFactId: 'list' });
  await expect(files.accept(end)).rejects.toThrow('daily_flow_table_frame_invalid');
});

it.each(['missing', 'duplicate', 'sequence', 'digest', 'count'] as const)('rejects %s data before a table can be installed', async fault => {
  const files = stage();
  await files.accept(begin);
  if (fault === 'missing') {
    await expect(files.accept(end)).rejects.toThrow('daily_flow_table_incomplete');
  } else if (fault === 'sequence') {
    await expect(files.accept({ ...batch, payload: { batchIndex: 1, records: [{ appliedFactId: 'list' }] } }))
      .rejects.toThrow('daily_flow_table_sequence_invalid');
  } else {
    await files.accept(batch);
    if (fault === 'duplicate') await expect(files.accept(batch)).rejects.toThrow('daily_flow_table_sequence_invalid');
    else await expect(files.accept({ ...end, payload: { batchCount: 1, recordCount: fault === 'count' ? 2 : 1,
      tableHash: fault === 'digest' ? new Uint8Array(32) : hash } })).rejects.toThrow('daily_flow_table_incomplete');
  }
  expect(files.complete).toBe(false);
});
