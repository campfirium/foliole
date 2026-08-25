import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN } from '../../lib/platform/syncGroupLifecycleContract.js';

import { InactiveSyncGroupLifecycleEndpoints } from './syncGroupLifecycleEndpoints.js';

it('returns manager_required without persisting on an ordinary provider', async () => {
  const db = rejectingPort();
  const endpoint = new InactiveSyncGroupLifecycleEndpoints(db.port, 'member-provider', 'member');

  await expect(endpoint.receiveJoinApplication(SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN, {}))
    .resolves.toEqual({ body: { error: 'manager_required' }, status: 409 });
  expect(db.run).not.toHaveBeenCalled();
  expect(db.query).not.toHaveBeenCalled();
});

it('fails closed on non-v4 wire input and remains absent from production routing', async () => {
  const db = rejectingPort();
  const endpoint = new InactiveSyncGroupLifecycleEndpoints(db.port, 'member-manager', 'manager');
  await expect(endpoint.receiveJoinApplication(SYNC_GROUP_LIFECYCLE_PREPARE_TOKEN, {
    protocol_version: 3
  })).rejects.toThrow('sync_group_lifecycle_invalid_protocol_version');
  const production = await Promise.all([
    readFile(path.resolve('electron/sync/lanWorkspaceSyncServer.ts'), 'utf8'),
    readFile(path.resolve('electron/main.ts'), 'utf8')
  ]);
  expect(production.join('\n')).not.toContain('InactiveSyncGroupLifecycleEndpoints');
});

function rejectingPort() {
  const query = vi.fn(async () => { throw new Error('unexpected query'); });
  const run = vi.fn(async () => { throw new Error('unexpected run'); });
  const port: DbPort = {
    query,
    run,
    transaction: async (execute) => execute(port)
  };
  return { port, query, run };
}
