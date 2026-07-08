import { beforeEach, expect, it, vi } from 'vitest';

const { persistSeedNodes } = vi.hoisted(() => ({
  persistSeedNodes: vi.fn(async () => undefined)
}));

vi.mock('./workspaceDebugSeedPersistence', () => ({
  persistSeedNodes
}));

import { readCachedWorkspaceNodeDocument, resetWorkspaceNodeDocumentCacheForTest } from '../../store/workspaceNodeDocumentCache';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { createSeedNodeDebugApi } from './workspaceDebugSeedApi';

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspaceNodeDocumentCacheForTest();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z')));
});

const debugSeed = {
  content: 'Seed body',
  id: 'debug-seed-topic',
  kind: 'topic' as const,
  title: 'Debug Seed Topic'
};

it('keeps debug seed persistence disabled unless the runtime explicitly allows it', async () => {
  await createSeedNodeDebugApi(() => false).seedNodes([debugSeed]);

  expect(useWorkspaceStore.getState().nodesById['debug-seed-topic']).toMatchObject({
    parentNodeId: null,
    title: 'Debug Seed Topic'
  });
  expect(useWorkspaceStore.getState().rendererBoundaryKeepNodeIds).toContain('debug-seed-topic');
  expect(readCachedWorkspaceNodeDocument('debug-seed-topic')).toMatchObject({
    content: 'Seed body'
  });
  expect(persistSeedNodes).not.toHaveBeenCalled();
});

it('persists debug seeds only after isolated runtime authorization', async () => {
  await createSeedNodeDebugApi(() => true).seedNodes([debugSeed]);

  expect(persistSeedNodes).toHaveBeenCalledWith([debugSeed]);
});
