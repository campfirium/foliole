// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertConvergedConflictTrace, createStateSignals
} from './macos-fri-two-device-sync.mjs';

describe('Mac and Fri provider state signals', () => {
  it('rejects an active and future wait when the provider fails', async () => {
    const signals = createStateSignals();
    const active = signals.waitFor('automatic-converged', 1_000);
    const failure = new Error('provider stopped');

    signals.fail(failure);

    await expect(active).rejects.toBe(failure);
    await expect(signals.waitFor('ready', 1_000)).rejects.toBe(failure);
  });

  it('fails a stage at its own deadline', async () => {
    const signals = createStateSignals();

    await expect(signals.waitFor('automatic-converged', 5)).rejects.toThrow(
      'Timed out waiting for provider state: automatic-converged'
    );
  });
});

it('requires both concurrent parents behind the Fri converged version', () => {
  const projection = { conflict_versions: [
    { content_hash: 'fri-hash', forks: ['fri'], is_current: false,
      object_id: 'node-1', parents: ['base'], version_id: 'fri' },
    { content_hash: 'mac-hash', forks: ['macos'], is_current: false,
      object_id: 'node-1', parents: ['base'], version_id: 'mac' },
    { content_hash: 'merged-hash', forks: ['fri', 'macos'], is_current: true,
      object_id: 'node-1', parents: ['fri', 'mac'], version_id: 'merged' }
  ] };

  expect(assertConvergedConflictTrace(projection)).toEqual({
    contentHash: 'merged-hash', objectId: 'node-1', parents: ['fri', 'mac'],
    versionId: 'merged'
  });
});
