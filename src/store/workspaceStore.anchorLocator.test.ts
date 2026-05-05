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

it('keeps text locator on highlight nodes created from editor selections', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore.getState().createHighlightNodeFromSelection(seedNodeId, 'selected text', 'hl-1', {
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 5,
      originalText: 'selected text',
      to: 18
    }
  });

  expect(createdId).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[createdId ?? '']?.anchorLink).toEqual({
    id: 'hl-1',
    kind: 'highlight',
    locator: {
      from: 5,
      originalText: 'selected text',
      to: 18
    }
  });
});

it('keeps text locator on cloze nodes created from editor selections', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore.getState().createQANodeFromSelection(
    seedNodeId,
    'What is [...]?',
    'selected text',
    'cloze-1',
    {
      id: 'cloze-1',
      kind: 'cloze',
      locator: {
        from: 5,
        originalText: 'selected text',
        to: 18
      }
    }
  );

  expect(createdId).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[createdId ?? '']?.anchorLink).toEqual({
    id: 'cloze-1',
    kind: 'cloze',
    locator: {
      from: 5,
      originalText: 'selected text',
      to: 18
    }
  });
});

it('keeps grouped text locators on multi-range cloze nodes created from editor selections', () => {
  const seedNodeId = getSeedNodeId();
  const createdId = useWorkspaceStore.getState().createQANodeFromSelection(
    seedNodeId,
    '[...] Beta [...] Delta',
    'Alpha\nGamma',
    'cloze-multi-1',
    {
      id: 'cloze-multi-1',
      kind: 'cloze',
      locator: {
        ranges: [
          {
            from: 0,
            originalText: 'Alpha',
            to: 5
          },
          {
            from: 11,
            originalText: 'Gamma',
            to: 16
          }
        ]
      }
    }
  );

  expect(createdId).toBeTruthy();
  expect(useWorkspaceStore.getState().nodesById[createdId ?? '']?.anchorLink).toEqual({
    id: 'cloze-multi-1',
    kind: 'cloze',
    locator: {
      ranges: [
        {
          from: 0,
          originalText: 'Alpha',
          to: 5
        },
        {
          from: 11,
          originalText: 'Gamma',
          to: 16
        }
      ]
    }
  });
});
