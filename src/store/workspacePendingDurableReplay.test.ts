import { expect, it, vi } from 'vitest';

const calls: string[] = [];

vi.mock('../shared/platform/workspaceRuntimeRepository', () => ({
  replayPendingWorkspaceNodeSync: vi.fn(async () => { calls.push('node-snapshot'); }),
  replayPendingWorkspaceDurableMutations: vi.fn(async () => { calls.push('durable'); })
}));

import { replayPendingWorkspaceMutations } from './workspacePendingDurableHydrate';

it('replays pending node snapshots before fixed durable mutations', async () => {
  calls.length = 0;

  await replayPendingWorkspaceMutations();

  expect(calls).toEqual(['node-snapshot', 'durable']);
});
