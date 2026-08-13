import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  markNodeContentEdited,
  markNodeContentPersisted,
  resetNodeContentVersionGuardForTests
} from './workspaceNodeContentVersionGuard';
import {
  createWorkspaceNodeMutationPatch,
  createWorkspaceNodeCreateAckPatch,
  didRuntimeConfirmNodeCreation
} from './workspaceNodeMutationPatch';
import { createInitialWorkspaceState } from './workspaceStore';

function createLocalNode(state: ReturnType<typeof createInitialWorkspaceState>) {
  return {
    ...state.nodesById[INBOX_NODE_ID]!,
    id: 'node-local',
    parentNodeId: INBOX_NODE_ID,
    kind: 'topic' as const,
    title: 'Local topic',
    isTitleManual: false,
    content: 'Local body',
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z'
  };
}

function createRuntimeSnapshot(overrides: Partial<Parameters<typeof createWorkspaceNodeMutationPatch>[1]['nodes'][number]> = {}) {
  return {
    nodeId: 'node-local',
    parentNodeId: INBOX_NODE_ID,
    kind: 'topic' as const,
    title: 'Runtime topic',
    isTitleManual: false,
    content: 'Runtime body',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  resetNodeContentVersionGuardForTests();
});

describe('createWorkspaceNodeMutationPatch metadata merge', () => {
  it('requires the requested node id in a creation acknowledgement', () => {
    expect(didRuntimeConfirmNodeCreation({ createdNodeIds: ['other-node'], nodes: [] }, 'node-local')).toBe(false);
    expect(didRuntimeConfirmNodeCreation({ createdNodeIds: ['node-local'], nodes: [] }, 'node-local')).toBe(true);
    expect(didRuntimeConfirmNodeCreation(null, 'node-local')).toBe(false);
  });

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

  it('merges only the acknowledged node and cannot replay late collection or session state', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);
    const nodeB = { ...localNode, content: 'Local B', id: 'node-b', title: 'Local B' };

    const patch = createWorkspaceNodeCreateAckPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-b': nodeB, 'node-local': localNode }
    }, {
      activeNodeId: 'node-local',
      createdNodeIds: ['node-local', 'node-b'],
      nodeOrder: [INBOX_NODE_ID, 'node-local'],
      nodes: [
        createRuntimeSnapshot({ content: '', updatedAt: '2026-03-07T00:00:02.000Z' }),
        createRuntimeSnapshot({ content: 'Runtime B', nodeId: 'node-b', title: 'Runtime B' })
      ]
    }, ['node-local']);

    expect(patch).not.toHaveProperty('activeNodeId');
    expect(patch).not.toHaveProperty('nodeOrder');
    expect(patch).not.toHaveProperty('editorOperationHistory');
    expect(patch.nodesById?.['node-local']?.content).toBe('Local body');
    expect(patch.nodesById?.['node-local']?.title).toBe('Runtime topic');
    expect(patch.nodesById?.['node-local']?.updatedAt).toBe('2026-03-07T00:00:02.000Z');
    expect(patch.nodesById?.['node-b']).toEqual(nodeB);
  });

});

describe('createWorkspaceNodeCreateAckPatch renderer boundary', () => {
  it('keeps current renderer loading markers without restoring an old node body', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = {
      ...createLocalNode(state),
      content: '',
      hasContent: true,
      hasReveal: true,
      reveal: null
    };
    const patch = createWorkspaceNodeCreateAckPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      createdNodeIds: ['node-local'],
      nodes: []
    }, ['node-local']);

    expect(patch.nodesById?.['node-local']).toMatchObject({
      content: '',
      hasContent: true,
      hasReveal: true,
      reveal: null
    });
  });
});

describe('createWorkspaceNodeMutationPatch body guard', () => {
  it('keeps local body when a stale runtime snapshot has the same timestamp', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);
    const patch = createWorkspaceNodeMutationPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      nodes: [createRuntimeSnapshot()]
    });

    expect(patch.nodesById?.['node-local']?.content).toBe('Local body');
    expect(patch.nodesById?.['node-local']?.title).toBe('Runtime topic');
  });

  it('accepts newer runtime body when local content is not dirty', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);
    const patch = createWorkspaceNodeMutationPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      nodes: [createRuntimeSnapshot({
        content: 'Remote body',
        updatedAt: '2026-03-07T00:00:01.000Z'
      })]
    });

    expect(patch.nodesById?.['node-local']?.content).toBe('Remote body');
  });

  it('keeps dirty local body when a newer runtime snapshot arrives before persist completes', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);
    markNodeContentEdited('node-local');
    const patch = createWorkspaceNodeMutationPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      nodes: [createRuntimeSnapshot({
        content: 'Remote body',
        updatedAt: '2026-03-07T00:00:01.000Z'
      })]
    });

    expect(patch.nodesById?.['node-local']?.content).toBe('Local body');
    markNodeContentPersisted('node-local', 1);
  });

});

describe('createWorkspaceNodeMutationPatch collection rename', () => {
  it('merges a structural rename into dirty local content without replacing its body', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = {
      ...createLocalNode(state),
      content: '---\ncollections:\n  - Old\n---\nUnsaved local body'
    };
    markNodeContentEdited('node-local');
    const patch = createWorkspaceNodeMutationPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      collectionRenames: [{ from: 'Old', nodeIds: ['node-local'], to: 'New' }],
      nodes: [createRuntimeSnapshot({
        content: '---\ncollections:\n  - New\n---\nPersisted body',
        updatedAt: '2026-03-07T00:00:01.000Z'
      })]
    });

    expect(patch.nodesById?.['node-local']?.content).toContain('- "New"');
    expect(patch.nodesById?.['node-local']?.content).toContain('Unsaved local body');
    expect(patch.nodesById?.['node-local']?.content).not.toContain('- "Old"');
  });
});

describe('createWorkspaceNodeMutationPatch empty runtime body guard', () => {
  it('does not let a newer empty runtime snapshot clear a local non-empty body', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);
    const version = markNodeContentEdited('node-local');
    markNodeContentPersisted('node-local', version);
    const patch = createWorkspaceNodeMutationPatch({
      ...state,
      nodesById: { ...state.nodesById, 'node-local': localNode }
    }, {
      nodes: [createRuntimeSnapshot({
        content: '',
        updatedAt: '2026-03-07T00:00:01.000Z'
      })]
    });

    expect(patch.nodesById?.['node-local']?.content).toBe('Local body');
    expect(patch.nodesById?.['node-local']?.hasContent).toBe(true);
  });
});
