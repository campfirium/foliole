import { beforeEach, expect, it } from 'vitest';

import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { acknowledgeContentEdit, captureContentEdit } from './workspaceContentEditAcknowledgements';
import { mergeHydratedNode } from './workspaceHydrateObjectMerge';
import { markNodeContentEdited, markNodeContentPersisted, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';
import type { WorkspaceState } from './workspaceStore';
import { createWorkspaceNodeActionsFixture } from './workspaceStoreNodeActions.test-support';

const node: WorkspaceState['nodesById'][string] = {
  id: 'topic', kind: 'topic', parentNodeId: null, content: 'Local', title: 'Topic',
  currentVersionId: 'ver_base', createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:01:00Z',
  reveal: null, review: null, anchorLink: null
};

beforeEach(() => {
  resetNodeContentVersionGuardForTests();
});

it('keeps pending input through hydration, then displays the confirmed merge', () => {
  const version = markNodeContentEdited(node.id);
  const remote = { ...node, content: 'Remote', currentVersionId: 'ver_remote', updatedAt: '2026-09-20T00:02:00Z' };
  expect(mergeHydratedNode(node, remote).content).toBe('Local');
  let state: WorkspaceState = { ...createWorkspaceNodeActionsFixture(), nodesById: { topic: node } };
  acknowledgeContentEdit({
    edit: captureContentEdit(node), node, version,
    result: {
      nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node, 0), content: 'Merged', updatedAt: remote.updatedAt }],
      contentEdit: { currentVersionId: 'ver_merge', submittedVersionId: 'ver_local' }
    },
    set: (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; }
  });
  markNodeContentPersisted(node.id, version);
  expect(state.nodesById.topic).toMatchObject({ content: 'Merged', currentVersionId: 'ver_merge' });
  expect(mergeHydratedNode(state.nodesById.topic, { ...remote, content: 'Later', updatedAt: '2026-09-20T00:03:00Z' }).content).toBe('Later');
});

it('replaces an old empty body status when a nonempty edit is confirmed', () => {
  const emptyNode = { ...node, content: '', hasContent: false, bodyStatus: 'empty' as const };
  const version = markNodeContentEdited(node.id);
  let state: WorkspaceState = { ...createWorkspaceNodeActionsFixture(), nodesById: { topic: emptyNode } };
  acknowledgeContentEdit({
    edit: captureContentEdit(emptyNode), node: emptyNode, version,
    result: {
      nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node, 0), content: 'Confirmed body' }],
      contentEdit: { currentVersionId: 'ver_confirmed', submittedVersionId: 'ver_local' }
    },
    set: (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; }
  });
  expect(state.nodesById.topic).toMatchObject({ bodyStatus: 'ready', content: 'Confirmed body' });
});

it('does not overwrite newer input with the merged projection', () => {
  const version = markNodeContentEdited(node.id);
  markNodeContentEdited(node.id);
  let state: WorkspaceState = { ...createWorkspaceNodeActionsFixture(), nodesById: { topic: { ...node, content: 'Continued local' } } };
  acknowledgeContentEdit({
    edit: captureContentEdit(node), node, version,
    result: {
      nodes: [{ ...createWorkspaceRuntimeNodeSnapshot(node, 0), content: 'Merged' }],
      contentEdit: { currentVersionId: 'ver_merge', submittedVersionId: 'ver_local' }
    },
    set: (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; }
  });
  expect(state.nodesById.topic).toMatchObject({ content: 'Continued local', currentVersionId: 'ver_local' });
  expect(state.nodesById.topic!.currentVersionId).toBe('ver_local');
});
