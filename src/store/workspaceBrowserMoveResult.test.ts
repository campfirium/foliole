import { afterEach, expect, it } from 'vitest';

import { createBrowserLocalWorkspaceMutationRepository, installWorkspaceMutationRepository,
  resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { maintenanceNode } from './workspaceSequentialReadingMaintenance.testSupport';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

const original = useWorkspaceStore.getState();
afterEach(() => {
  resetWorkspaceMutationRepository();
  useWorkspaceStore.setState(original, true);
});

it('maintains sequential reading through a Demo move and exact undo using the shared rules', async () => {
  installWorkspaceMutationRepository(createBrowserLocalWorkspaceMutationRepository());
  useWorkspaceStore.setState({ ...createInitialWorkspaceState(), isHydrated: true,
    nodeOrder: ['source', 'one', 'two', 'target'],
    nodesById: {
      source: { ...maintenanceNode('source', null), sequentialReadingEnabled: true },
      one: maintenanceNode('one', 'source', 'active'),
      two: maintenanceNode('two', 'source', 'locked'),
      target: maintenanceNode('target', null)
    }
  });
  expect(await useWorkspaceStore.getState().moveNodes(['one'], 'target', 'child')).toBe(true);
  expect(useWorkspaceStore.getState().nodesById.two?.reading)
    .toMatchObject({ state: 'active', readingPosition: 17, repetitionCount: 2 });
  await useWorkspaceStore.getState().undoWorkspaceAction();
  await expect.poll(() => useWorkspaceStore.getState().nodesById.one?.parentNodeId).toBe('source');
  expect(useWorkspaceStore.getState().nodeOrder.filter((id) => ['source', 'one', 'two', 'target'].includes(id)))
    .toEqual(['source', 'one', 'two', 'target']);
});
