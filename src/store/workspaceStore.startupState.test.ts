import { expect, it } from 'vitest';

import { HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState } from './workspaceStore';

it('starts with the special root nodes and no fake welcome note', () => {
  const initial = createInitialWorkspaceState(new Date('2026-04-10T00:00:00.000Z'));

  expect(initial.isHydrated).toBe(false);
  expect(initial.activeNodeId).toBeNull();
  expect(initial.nodeOrder).toEqual([HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
  expect(Object.keys(initial.nodesById)).toEqual([HOME_NODE_ID, INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
});
