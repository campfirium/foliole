// @vitest-environment node
/* global process */
import { expect, it, vi } from 'vitest';

import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';

function startProvider(action) {
  let settle;
  const execute = vi.fn((_command, args) => args[1].startsWith('multi-device-sync-provider-')
    ? Promise.resolve({ code: 0 })
    : new Promise((resolve) => { settle = resolve; }));
  const provider = startWindowsSyncGroupProvider({ action, execute, repoRoot: process.cwd() });
  return { provider, execute, settle: () => settle({ code: 0 }) };
}

it.each(['single-principal-sync-group', 'two-device-sync-provider'])(
  'keeps %s alive through conflict convergence and both host restarts', async (action) => {
    const { provider, execute, settle } = startProvider(action);
    await provider.release('consumer_complete');
    await provider.release('consumer_complete');
    expect(execute.mock.calls.slice(1).map(([, args]) => args[1])).toEqual([
      'multi-device-sync-provider-complete', 'multi-device-sync-provider-complete'
    ]);
    await expect(provider.release('consumer_complete')).rejects.toMatchObject({
      missingFact: 'windows_provider_release_limit_exceeded'
    });
    settle();
  }
);

it('can cancel the joined host while waiting for the final restart check', async () => {
  const { provider, execute, settle } = startProvider('single-principal-sync-group');
  await provider.release('consumer_complete');
  const cancellation = provider.cancelAndSettle();
  await Promise.resolve();
  expect(execute.mock.calls.at(-1)[1][1]).toBe('multi-device-sync-provider-cancel');
  settle();
  await cancellation;
});

it('retains a single completion notification for a one-stage provider', async () => {
  const { provider, settle } = startProvider('multi-device-sync-c');
  await provider.release('consumer_complete');
  await expect(provider.release('consumer_complete')).rejects.toMatchObject({
    missingFact: 'windows_provider_release_limit_exceeded'
  });
  settle();
});
