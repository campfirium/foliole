import { expect, it } from 'vitest';

import {
  parsePairSyncRecoveryInstrumentationResult
} from '../sync-group/pair-sync-feature-contract.mjs';

it('preserves bounded instrumentation output when receipt parsing fails', () => {
  const output = [
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=initial-sync-started',
    'Timed out waiting for initial workspace sync settlement.',
    'INSTRUMENTATION_CODE: -1'
  ].join('\n');
  const result = { code: 0, output, stdout: output };
  let failure;
  try { parsePairSyncRecoveryInstrumentationResult(result); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({
    failureReason: 'initial_sync_settlement_timeout', result,
    stage: 'pair-sync-instrumentation'
  });
});

it.each([
  ['target_disabled', 'initial_sync_busy_timeout'],
  ['target_missing', 'initial_sync_surface_missing'],
  ['settled with attention', 'initial_sync_needs_attention'],
  ['existing sync failed', 'existing_sync_failed']
])('classifies the sanitized settlement state %s', (targetState, failureReason) => {
  const output = [
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=structure-pack-applied',
    targetState === 'settled with attention'
      ? 'Initial workspace sync settled with attention.'
      : targetState === 'existing sync failed'
        ? 'Existing workspace sync failed.'
      : `Timed out waiting for initial workspace sync settlement: ${targetState}.`,
    'INSTRUMENTATION_CODE: -1'
  ].join('\n');
  expect(() => parsePairSyncRecoveryInstrumentationResult({ code: 0, output, stdout: output }))
    .toThrow(expect.objectContaining({ failureReason }));
});
