import { beforeEach, expect, it, vi } from 'vitest';

import type { FormulaClozeCreatePayload } from '../features/formula-cloze/model/formulaCloze';

import { useWorkspaceStore } from './workspaceStore';

const nodeStorage = vi.hoisted(() => ({
  listNodeOrder: vi.fn<() => Promise<string[]>>(),
  loadNodes: vi.fn(),
  saveNode: vi.fn(),
  saveNodeOrder: vi.fn()
}));

vi.mock('../../lib/platform/storage', () => ({
  nodeStorage
}));

beforeEach(() => {
  useWorkspaceStore.persist.clearStorage();
  useWorkspaceStore.setState({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      'node-1': {
        anchorLink: null,
        content: 'Before $E=mc^2$ after',
        createdAt: '2026-03-25T10:00:00.000Z',
        hasContent: true,
        hasReveal: false,
        id: 'node-1',
        kind: 'topic',
        parentNodeId: null,
        reveal: null,
        review: null,
        title: 'Parent',
        updatedAt: '2026-03-25T10:00:00.000Z'
      }
    },
    trashedNodeIds: [],
    untitledSequenceByParent: {}
  });
});

function createPayload(): FormulaClozeCreatePayload {
  return {
    display: 'inline',
    formulaRange: { from: 7, to: 15 },
    formulaSource: '$E=mc^2$',
    occurrenceKey: 'inline:7:15:E=mc^2',
    selection: {
      algorithm: 'katex-dom-leaf-v1',
      fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
      leaves: [
        {
          path: [0],
          structureFingerprint: 'mord',
          textFingerprint: 'E=mc2'
        }
      ]
    }
  };
}

it('creates a formula cloze child without storing formula regions as image attachment state', () => {
  const createdId = useWorkspaceStore.getState().createFormulaClozeNode(
    'node-1',
    createPayload(),
    {
      promptContent: '$E=mc^2$',
      revealContent: '$E=mc^2$'
    }
  );

  expect(createdId).toBeTruthy();
  const createdNode = useWorkspaceStore.getState().nodesById[createdId as string];
  expect(createdNode?.parentNodeId).toBe('node-1');
  expect(createdNode?.kind).toBe('item');
  expect(createdNode?.title).toBe('E=mc2');
  expect(createdNode?.content).toBe('$E=mc^2$');
  expect(createdNode?.reveal).toBe('$E=mc^2$');
  expect(createdNode?.review).not.toBeNull();
  expect(createdNode?.imageRegions).toBeUndefined();
  expect(useWorkspaceStore.getState().nodesById['node-1']?.imageRegions).toBeUndefined();
  expect(createdNode?.anchorLink).toMatchObject({
    kind: 'cloze',
    locator: {
      display: 'inline',
      fallbackRect: { height: 0.4, width: 0.3, x: 0.1, y: 0.2 },
      formulaSource: '$E=mc^2$',
      kind: 'formula-region',
      occurrenceKey: 'inline:7:15:E=mc^2'
    }
  });
});

it('rejects a formula cloze without a reusable DOM selection', () => {
  const invalidPayload = {
    ...createPayload(),
    selection: {
      ...createPayload().selection,
      leaves: []
    }
  };

  const createdId = useWorkspaceStore.getState().createFormulaClozeNode(
    'node-1',
    invalidPayload,
    { promptContent: '$E=mc^2$', revealContent: '$E=mc^2$' }
  );

  expect(createdId).toBeNull();
  expect(useWorkspaceStore.getState().nodeOrder).toEqual(['node-1']);
});
