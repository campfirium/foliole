import { beforeEach, expect, it } from 'vitest';

import { INBOX_NODE_ID, VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
  useWorkspaceStore.getState().createRootNode('');
}

function getSeedNodeId() {
  const seedNodeId = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => nodeId !== INBOX_NODE_ID && nodeId !== VIRTUAL_ROOT_NODE_ID);
  if (!seedNodeId) {
    throw new Error('missing seed node');
  }
  return seedNodeId;
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceStore();
});

it('updates only the highlight locator after editing the parent content inside the anchored range', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha Beta Gamma');

  const createdId = useWorkspaceStore.getState().createHighlightNodeFromSelection(seedNodeId, 'Beta', 'hl-4', {
    id: 'hl-4',
    kind: 'highlight',
    locator: {
      from: 6,
      originalText: 'Beta',
      to: 10
    }
  });

  if (!createdId) {
    throw new Error('expected highlight node');
  }

  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha Better Gamma');

  expect(useWorkspaceStore.getState().nodesById[createdId]).toEqual(
    expect.objectContaining({
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-4',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Better',
          to: 12
        }
      }
    })
  );
});

it('keeps the child highlight as an unresolved zero-width anchor after deleting the anchored parent text', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha Beta Gamma');

  const createdId = useWorkspaceStore.getState().createHighlightNodeFromSelection(seedNodeId, 'Beta', 'hl-5', {
    id: 'hl-5',
    kind: 'highlight',
    locator: {
      from: 6,
      originalText: 'Beta',
      to: 10
    }
  });

  if (!createdId) {
    throw new Error('expected highlight node');
  }

  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha  Gamma');

  expect(useWorkspaceStore.getState().nodesById[createdId]).toEqual(
    expect.objectContaining({
      content: 'Beta',
      title: 'Beta',
      anchorLink: {
        id: 'hl-5',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    })
  );
});

it('keeps the child cloze as an unresolved zero-width anchor after deleting the anchored parent text', () => {
  const seedNodeId = getSeedNodeId();
  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha Beta Gamma');

  const createdId = useWorkspaceStore.getState().createQANodeFromSelection(
    seedNodeId,
    'Alpha [...] Gamma',
    'Beta',
    'cloze-5',
    {
      id: 'cloze-5',
      kind: 'cloze',
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    }
  );

  if (!createdId) {
    throw new Error('expected cloze node');
  }

  useWorkspaceStore.getState().updateNodeContent(seedNodeId, 'Alpha  Gamma');

  expect(useWorkspaceStore.getState().nodesById[createdId]).toEqual(
    expect.objectContaining({
      content: 'Alpha [...] Gamma',
      title: 'Alpha [...] Gamma',
      reveal: 'Beta',
      anchorLink: {
        id: 'cloze-5',
        kind: 'cloze',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    })
  );
});
