import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_NODE_ID } from '../features/nodes/model/specialNodes';

import {
  markNodeContentEdited,
  markNodeContentPersisted,
  resetNodeContentVersionGuardForTests
} from './workspaceNodeContentVersionGuard';
import {
  createWorkspaceNodeMutationPatch,
  createWorkspaceNodeMutationPatchWithLocalSideEffects
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

  it('keeps local created content while preserving runtime metadata for the same id', () => {
    const state = createInitialWorkspaceState(new Date('2026-03-06T00:00:00.000Z'));
    const localNode = createLocalNode(state);

    const patch = createWorkspaceNodeMutationPatchWithLocalSideEffects(state, {
      activeNodeId: 'node-local',
      nodeOrder: [INBOX_NODE_ID, 'node-local'],
      nodes: [{
        nodeId: 'node-local',
        parentNodeId: INBOX_NODE_ID,
        kind: 'topic',
        title: 'Runtime topic',
        isTitleManual: false,
        content: '',
        reveal: null,
        anchorLink: null,
        position: 1,
        createdAt: '2026-03-07T00:00:00.000Z',
        updatedAt: '2026-03-07T00:00:02.000Z'
      }]
    }, {
      activeNodeId: 'node-local',
      nodeOrder: [INBOX_NODE_ID, 'node-local'],
      nodesById: {
        ...state.nodesById,
        'node-local': localNode
      }
    });

    expect(patch.activeNodeId).toBe('node-local');
    expect(patch.nodeOrder).toEqual([INBOX_NODE_ID, 'node-local']);
    expect(patch.nodesById?.['node-local']?.content).toBe('Local body');
    expect(patch.nodesById?.['node-local']?.title).toBe('Runtime topic');
    expect(patch.nodesById?.['node-local']?.updatedAt).toBe('2026-03-07T00:00:02.000Z');
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
