// @vitest-environment node
import { expect, it } from 'vitest';
import { assertFriRunSucceeded } from './fri-run-result.mjs';

function output(invocationId = 'current', completedId = invocationId) {
  return [JSON.stringify({ event: 'fri-run-started', invocationId }),
    JSON.stringify({ event: 'fri-run-completed', invocationId: completedId,
      promoted: '/evidence/current', diagnosis: { methodsStarted: [],
        failures: [{ kind: 'automation-startup', message: 'Timed out while enabling automation mode.' }] } })].join('\n');
}

it('exposes automation startup failure and retains original exit and evidence', () => {
  try { assertFriRunSucceeded({ code: 65, output: output() }); }
  catch (error) {
    expect(error).toMatchObject({ code: 65, invocationId: 'current', evidenceRoot: '/evidence/current' });
    expect(error.message).toContain('automation-startup');
    return;
  }
  throw new Error('Expected the failed batch to stop.');
});

it('refuses unrelated receipts and keeps missing evidence unknown', () => {
  expect(() => assertFriRunSucceeded({ code: 65, output: output('current', 'old') }))
    .toThrow('unknown');
});

it('does not reinterpret an outer interruption as a product failure', () => {
  expect(() => assertFriRunSucceeded({ code: 124, output: output(), terminationReason: 'hard_deadline' }))
    .toThrow('interrupted (hard_deadline); observed=automation-startup');
});

it('preserves successful batch behavior', () => {
  expect(() => assertFriRunSucceeded({ code: 0, output: '' })).not.toThrow();
});
