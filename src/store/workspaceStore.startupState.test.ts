import { expect, it } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState } from './workspaceStore';

it('starts with only the real root nodes and no fake welcome note', () => {
  const initial = createInitialWorkspaceState(new Date('2026-04-10T00:00:00.000Z'));

  expect(initial.isHydrated).toBe(false);
  expect(initial.activeNodeId).toBeNull();
  expect(initial.nodeOrder).toEqual([INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
  expect(Object.keys(initial.nodesById)).toEqual([INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID]);
});
