// @vitest-environment node

import { expect, it } from 'vitest';

import { checkedPairSyncCommand } from './windows-a5-pair-sync-command.mjs';

it('preserves timed-out instrumentation output for failure classification', async () => {
  const output = 'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-awaiting\n';
  const execute = async () => {
    throw Object.assign(new Error('adb timed out'), {
      result: { output }, code: 'pair_sync_instrumentation_timeout'
    });
  };

  await expect(checkedPairSyncCommand(execute, 'adb', [], {}, 'pair-sync-instrumentation'))
    .rejects.toMatchObject({
      failureReason: 'pair_request_awaiting_interrupted', result: { output },
      stage: 'pair-sync-instrumentation'
    });
});
