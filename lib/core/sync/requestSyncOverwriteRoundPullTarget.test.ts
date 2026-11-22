import { beforeEach, expect, it, vi } from 'vitest';

import type { RequestSyncDatabaseRoundPort } from './requestSyncDatabaseRound.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import type { SyncGroupOverwriteProgress } from './syncGroupOverwriteProgress.js';

const state = vi.hoisted(() => ({ adoption: null as object | null, ports: [] as RequestSyncDatabaseRoundPort[] }));

vi.mock('./syncGroupOverwriteProgress.js', async actual => ({
  ...await actual<typeof import('./syncGroupOverwriteProgress.js')>(),
  assertSyncGroupOverwriteInbound: async () => true
}));
vi.mock('./syncGroupLocalAdoption.js', async actual => ({
  ...await actual<typeof import('./syncGroupLocalAdoption.js')>(),
  loadSyncGroupLocalAdoption: async () => state.adoption
}));
vi.mock('./requestSyncDatabaseRound.js', async actual => ({
  ...await actual<typeof import('./requestSyncDatabaseRound.js')>(),
  deliverRequestSyncDatabaseDifferences: async (port: RequestSyncDatabaseRoundPort) => {
    state.ports.push(port);
    return { delivered: [], deferred: [{}], sourceChanged: false, yielded: false };
  }
}));

const { runRequestSyncOverwriteRound } = await import('./requestSyncOverwriteRound.js');

beforeEach(() => { state.ports.length = 0; });

it.each([[{ groupId: 'group' }, 3000], [null, undefined]])(
  'gives only first adoption the longer pull target (%o)', async (adoption, expected) => {
    state.adoption = adoption;
    const port = { exchangeInventory: async () => ({ local: [], remote: [] }), transferObjects: async () => [],
      reportObjectError: () => undefined, watchLocalChanges: () => () => false } as RequestSyncDatabaseRoundPort;
    const host = { readSnapshot: async (read: (db: unknown) => unknown) => read({}) } as unknown as RequestSyncDatabaseHost;
    const result = await runRequestSyncOverwriteRound(host, {} as SyncGroupOverwriteProgress, port);
    expect(result.complete).toBe(false);
    expect(state.ports).toHaveLength(1);
    expect(state.ports[0]!.pullTargetMs).toBe(expected);
    expect(state.ports[0]!.watchLocalChanges).toBe(port.watchLocalChanges);
  });
