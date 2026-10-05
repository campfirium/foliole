import { expect, it, vi } from 'vitest';

import type { DbPort } from '../sync/dbPort.js';

import { computeCompanionContentHash, rehashCompanionHostState } from './companionHostStateHashes.js';

it('publishes changed setting hashes with a new sequence while leaving equal hashes untouched', async () => {
  const setting = {
    form_factor: 'desktop', host_name: '*', key: 'library_path_settings',
    platform: 'windows', scope: 'user_space', value_json: '{"inbox":"/Library/Inbox"}'
  };
  const run = vi.fn(async (...args: unknown[]) => {
    void args;
    return { changes: 1, lastInsertRowId: null };
  });
  const query = vi.fn()
    .mockResolvedValueOnce([setting])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

  await rehashCompanionHostState({ query, run } as unknown as DbPort, 'Android A5');

  const hash = computeCompanionContentHash(setting);
  expect(run).toHaveBeenNthCalledWith(2, expect.stringContaining(
    'state_seq = (SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1), sync_dirty = 1'
  ), [hash, 'setting', 'user_space:windows:desktop:*:library_path_settings', hash]);
  expect(run.mock.calls[1]?.[0]).toContain('content_hash IS NOT ?');
});
