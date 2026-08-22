import { expect, it, vi } from 'vitest';

import type { DbPort } from '../sync/dbPort.js';

import { computeCompanionContentHash, rehashCompanionHostState } from './companionHostStateHashes.js';

it('keeps confirmed setting state clean when host bootstrap does not change its hash', async () => {
  const setting = {
    form_factor: 'desktop', host_name: '*', key: 'library_path_settings',
    platform: 'windows', scope: 'user_space', value_json: '{"inbox":"/Library/Inbox"}'
  };
  const run = vi.fn(async () => ({ changes: 1, lastInsertRowId: null }));
  const query = vi.fn()
    .mockResolvedValueOnce([setting])
    .mockResolvedValueOnce([]);

  await rehashCompanionHostState({ query, run } as unknown as DbPort, 'Android A5');

  const hash = computeCompanionContentHash(setting);
  expect(run).toHaveBeenNthCalledWith(2, expect.stringContaining(
    'CASE WHEN content_hash = ? THEN sync_dirty ELSE 1 END'
  ), [hash, hash, 'setting', 'user_space:windows:desktop:*:library_path_settings']);
});
