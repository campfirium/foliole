import { vi } from 'vitest';

type HydratedAnchorLink = {
  id: string;
  kind: 'highlight' | 'cloze';
  locator?: {
    from: number;
    originalText: string;
    to: number;
  };
} | null;

export type HydratedState = {
  activeNodeId: string;
  nodesById: Record<
    string,
    {
      title?: string;
      content: string;
      reveal: string | null;
      anchorLink?: HydratedAnchorLink;
    }
  >;
};

function createUpdatedParentNode() {
  return {
    id: 'node-2',
    parentNodeId: null,
    kind: 'topic',
    title: 'Parent',
    isTitleManual: false,
    content: '',
    hasContent: true,
    hasReveal: false,
    reveal: null,
    anchorLink: null,
    reading: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  };
}

function createUpdatedHighlightChildNode() {
  return {
    id: 'node-highlight',
    parentNodeId: 'node-2',
    kind: 'topic',
    title: 'Beta',
    isTitleManual: false,
    content: 'Beta',
    hasContent: true,
    hasReveal: false,
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight' as const,
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    reading: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z'
  };
}

function createUpdatedClozeChildNode() {
  return {
    id: 'node-cloze',
    parentNodeId: 'node-2',
    kind: 'item',
    title: 'Alpha [...] Gamma',
    isTitleManual: false,
    content: 'Alpha [...] Gamma',
    hasContent: true,
    hasReveal: true,
    reveal: 'Beta',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze' as const,
      locator: {
        from: 6,
        originalText: 'Beta',
        to: 10
      }
    },
    reading: null,
    review: null,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z'
  };
}

export function readHydratedState(value: string | null) {
  return value ? (JSON.parse(value) as { state: HydratedState }).state : null;
}

export function createUpdatedChildAnchorSnapshot() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['node-2', 'node-highlight', 'node-cloze'],
    nodesById: {
      'node-2': createUpdatedParentNode(),
      'node-highlight': createUpdatedHighlightChildNode(),
      'node-cloze': createUpdatedClozeChildNode()
    },
    trashedNodeIds: []
  };
}

export function createUpdatedParentDocument() {
  return {
    nodeId: 'node-2',
    kind: 'topic',
    content: 'Alpha Better Gamma',
    hideTitleHeading: false,
    reveal: null
  };
}

export function createUpdatedChildAnchorRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve(createUpdatedChildAnchorSnapshot());
    }
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve(createUpdatedParentDocument());
    }
    if (command === 'update_node_content') {
      return Promise.resolve(null);
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

export function expectReplayedUpdatedChildHighlight(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
    nodeId: 'node-highlight',
    title: 'Better',
    content: 'Better',
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Better',
        to: 12
      }
    }
  }));
}

export function expectReplayedUpdatedChildCloze(invoke: ReturnType<typeof vi.fn>) {
  expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
    nodeId: 'node-cloze',
    title: 'Alpha [...] Gamma',
    content: 'Alpha [...] Gamma',
    reveal: 'Beta',
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
      locator: {
        from: 6,
        originalText: 'Better',
        to: 12
      }
    }
  }));
}
