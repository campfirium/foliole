import { beforeEach, expect, it } from 'vitest';

import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import {
  acknowledgeContentEdit, captureContentEdit, continueContentEdit,
  rememberCreatedContentVersion,
  resetContentEditAcknowledgementsForTests
} from './workspaceContentEditAcknowledgements';
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
  resetContentEditAcknowledgementsForTests();
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

it('does not overwrite newer input and continues its local branch rather than the merged projection', () => {
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
  const next = captureContentEdit(node)!;
  continueContentEdit(node.id, next);
  expect(next.baseVersionId).toBe('ver_local');
});

it('uses the creation acknowledgement for input captured before the node existed', () => {
  const draft = { ...node, currentVersionId: null };
  expect(captureContentEdit(draft)).toBeUndefined();
  rememberCreatedContentVersion(node.id, 'ver_created');
  expect(captureContentEdit(draft)?.baseVersionId).toBe('ver_created');
});

it('continues a draft captured before several local acknowledgements', () => {
  const acknowledge = (baseVersionId: string, submittedVersionId: string) => {
    const edit = { baseVersionId, versionId: submittedVersionId };
    continueContentEdit(node.id, edit);
    acknowledgeContentEdit({
      edit, node, version: 1, set: () => undefined,
      result: {
        nodes: [createWorkspaceRuntimeNodeSnapshot(node, 0)],
        contentEdit: { currentVersionId: submittedVersionId, submittedVersionId }
      }
    });
  };
  acknowledge('ver_base', 'ver_one');
  acknowledge('ver_one', 'ver_two');
  acknowledge('ver_one', 'ver_three');
  const next = { baseVersionId: 'ver_one', versionId: 'ver_four' };
  continueContentEdit(node.id, next);
  expect(next.baseVersionId).toBe('ver_three');
});
