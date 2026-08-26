import { expect, it } from 'vitest';

import { verifySyncTriggerAcceptance } from './ios-sync-trigger-acceptance-runner.mjs';

const first = {
  durable_result: true, native_runtime: 'ios', phase: 'trigger-observed',
  previous_result_restored: false, run_id: 'run-1', status: 'passed', trigger_reason: 'manual'
};
const second = { ...first, previous_result_restored: true, run_id: 'run-2' };

it('requires native manual command evidence and a result restored after restart', () => {
  expect(verifySyncTriggerAcceptance(first, second)).toEqual({ first, second });
  expect(() => verifySyncTriggerAcceptance(first, { ...second, previous_result_restored: false }))
    .toThrow('native runtime and persistence acceptance evidence is incomplete');
});
