import { expect, it } from 'vitest';

import { readA5JoinReceipt } from './a5-two-device-join-evidence.mjs';

function output(run) {
  return `INSTRUMENTATION_STATUS: folioleSyncGroupJoinReceipt=${JSON.stringify({
    joined: true, restarted: true, initialRun: run
  })}\nINSTRUMENTATION_CODE: -1\n`;
}

const partial = {
  device_identity_key: 'device-a5', occurred_at: '2026-09-29T12:00:00Z',
  resourceProof: { recoveringHash: 'hash', missingAttachmentHashes: ['hash'] },
  result: 'partial', run_id: 'run-initial', status: 'skipped', trigger_reason: 'initial'
};

it('keeps the attributed initial partial run identity', () => {
  expect(readA5JoinReceipt(output(partial)).initialRun).toEqual(partial);
});

it('rejects an initial partial without pre-restart resource evidence', () => {
  expect(() => readA5JoinReceipt(output({ ...partial, resourceProof: undefined })))
    .toThrow('resource proof is missing');
});

it('does not substitute a later recovery run for initial', () => {
  expect(() => readA5JoinReceipt(output({ ...partial, trigger_reason: 'automatic',
    status: 'completed', result: 'completed' }))).toThrow('initial run identity');
});

it('rejects a failed initial terminal', () => {
  expect(() => readA5JoinReceipt(output({ ...partial, status: 'failed', result: 'failed' })))
    .toThrow('terminal is unexpected');
});
