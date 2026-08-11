import { expect, it, vi } from 'vitest';

import { collectEnvironmentReadiness } from './multi-device-sync-readiness.mjs';

const ready = (fact) => async () => ({ facts: [fact] });

it('returns every host blocker together and never hides an unbound adapter', async () => {
  const result = await collectEnvironmentReadiness({ adapters: {
    'macos-a': async () => { throw Object.assign(new Error('owner'), {
      lastSuccessfulAction: 'path_checked', missingFact: 'isolated_owner_mismatch'
    }); },
    'android-b': async () => { throw Object.assign(new Error('adb'), {
      missingFact: 'fixed_a5_unavailable'
    }); }
  } });
  expect(result.allReady).toBe(false);
  expect(result.receipts.map(({ host, missingFact }) => [host, missingFact])).toEqual([
    ['macos-a', 'isolated_owner_mismatch'], ['android-b', 'fixed_a5_unavailable'],
    ['windows-c', 'adapter_unbound']
  ]);
});

it('finishes green only when all three fixed hosts report facts', async () => {
  const result = await collectEnvironmentReadiness({ adapters: {
    'macos-a': ready('mac_isolated_ready'), 'android-b': ready('a5_ready'),
    'windows-c': ready('windows_isolated_ready')
  } });
  expect(result.status).toBe('passed');
  expect(result.receipts.every(({ status }) => status === 'passed')).toBe(true);
});

it('turns the 45-second boundary into an environment blocker', async () => {
  vi.useFakeTimers();
  const pending = collectEnvironmentReadiness({ adapters: {
    'macos-a': () => new Promise(() => {}), 'android-b': ready('a5_ready'),
    'windows-c': ready('windows_ready')
  }, now: () => Date.now() });
  await vi.advanceTimersByTimeAsync(45_000);
  const result = await pending;
  expect(result.receipts[0]).toMatchObject({
    failureOwner: 'environment', missingFact: 'readiness_deadline_exceeded', status: 'blocked'
  });
  vi.useRealTimers();
});
