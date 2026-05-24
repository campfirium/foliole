import { describe, expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import { createInitialWorkspaceState } from './workspaceStore';

describe('createWorkspaceNodeMutationPatch', () => {
  it('preserves local special node kind when runtime snapshot omits renderer-only metadata', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const patch = createWorkspaceNodeMutationPatch(state, {
      nodes: [{
        nodeId: INBOX_NODE_ID,
        parentNodeId: null,
        kind: 'folder',
        title: 'Inbox',
        isTitleManual: true,
        content: '',
        reveal: null,
        anchorLink: null,
        position: 0,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:00.000Z'
      }]
    });

    expect(patch.nodesById?.[INBOX_NODE_ID]?.specialKind).toBe('inbox');
  });
});
