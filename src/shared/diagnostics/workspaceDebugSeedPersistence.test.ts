import { expect, it, vi } from 'vitest';

import { captureContentEdit } from '../../store/workspaceContentEditAcknowledgements';
import { readCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';
import { createWorkspaceRuntimeNodeSnapshot } from '../platform/workspaceRuntimeNodeRepository';
import type { WorkspaceRuntimeNode } from '../platform/workspaceRuntimeTypes';

import { createSeedNodeDebugApi } from './workspaceDebugSeedApi';

vi.mock('../platform/workspaceRuntimeRepository', async importOriginal => ({
  ...await importOriginal<typeof import('../platform/workspaceRuntimeRepository')>(),
  saveCreatedWorkspaceNodeMutationSnapshot: vi.fn(async ({ node }: { node: WorkspaceRuntimeNode }) => ({
    createdNodeIds: [node.id], nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node), currentVersionId: 'seed-version' }]
  })),
  saveWorkspaceNodeOrder: vi.fn()
}));

it('keeps the persisted seed identity as the basis of its first real editor save', async () => {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-10-17T00:00:00.000Z')));
  await createSeedNodeDebugApi(() => true).seedNodes([{ id: 'seed', kind: 'topic', title: 'Seed', content: 'Seed body' }]);
  const seeded = useWorkspaceStore.getState().nodesById.seed!;
  expect(seeded.currentVersionId).toBe('seed-version');
  expect(readCachedWorkspaceNodeDocument('seed')?.currentVersionId).toBe('seed-version');
  expect(captureContentEdit(seeded)?.baseVersionId).toBe('seed-version');
});
