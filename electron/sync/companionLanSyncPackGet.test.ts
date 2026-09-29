// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { buildCompanionSyncPackResource } from './companionLanSyncPack.js';
import { handleSyncPackGet } from './companionLanSyncPackGet.js';

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: (task: () => unknown) => task()
}));
vi.mock('./companionLanSyncPack.js', () => ({
  SYNC_PACK_PATH: '/companion/sync-pack',
  buildCompanionSyncPackResource: vi.fn(async () => ({
    status: 'error', statusCode: 409, error: 'source_view_unavailable'
  }))
}));

it('routes a completed paged fact view into pack construction', async () => {
  const writeJson = vi.fn();
  const url = new URL('http://localhost/companion/sync-pack?page_contract=bounded-v1&fact_view=view');
  expect(await handleSyncPackGet({} as never, {} as never, url, 'peer', writeJson)).toBe(true);
  expect(buildCompanionSyncPackResource).toHaveBeenCalledWith(url, 'peer');
  expect(writeJson).toHaveBeenCalledWith({}, {}, 409, { error: 'source_view_unavailable' }, 'GET, OPTIONS');
});
