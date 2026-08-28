import { expect, it, vi } from 'vitest';

import { observeT132A5Provider } from './macos-a5-sync-group-provider-acceptance.mjs';

it('observes the legacy acceptance boundary through the OS DNS-SD adapter', async () => {
  const stop = vi.fn();
  const startBrowse = vi.fn(() => ({ stop }));

  await expect(observeT132A5Provider({ durationMs: 0, startBrowse })).resolves.toBeNull();

  expect(startBrowse).toHaveBeenCalledWith({
    domain: 'local.', type: '_foliole-sync._tcp'
  }, expect.any(Function));
  expect(stop).toHaveBeenCalledOnce();
});
