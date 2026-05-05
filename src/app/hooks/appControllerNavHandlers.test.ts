import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLayoutNav } from './appControllerNavHandlers';

function createNavHarness(args: {
  activeNodeId: string;
  handleSelectBreadcrumbNode?: ReturnType<typeof vi.fn>;
  nodesById: Record<string, unknown>;
  onSelectNode?: ReturnType<typeof vi.fn>;
}) {
  const handleSelectBreadcrumbNode = args.handleSelectBreadcrumbNode ?? vi.fn();
  const onSelectNode = args.onSelectNode ?? vi.fn();
  const nav = createLayoutNav({
    nav: {
      handleGoBack: vi.fn(),
      handleGoForward: vi.fn(),
      handleGoParent: vi.fn(),
      handleSelectBreadcrumbNode,
      handleSelectNode: vi.fn(),
      shouldSuppressSelectionRestore: vi.fn(() => false)
    },
    ws: {
      activeNodeId: args.activeNodeId,
      nodeViewById: {},
      setNodeViewState: vi.fn(),
      nodesById: args.nodesById
    },
    runtime: {
      bumpReadingPositionRequest: vi.fn(),
      readingPositionRef: { current: { nodeId: null, selection: null } },
      readingPositionSyncRef: { current: { nodeId: null, state: null } }
    }
  } as never, onSelectNode);
  return { handleSelectBreadcrumbNode, nav, onSelectNode };
}

function createTopicNode(id: string, parentNodeId: string | null, title: string, anchorLink: unknown = null) {
  return {
    id,
    parentNodeId,
    kind: 'topic',
    title,
    content: title,
    anchorLink,
    reveal: null,
    review: null,
    createdAt: '',
    updatedAt: ''
  };
}

function runBreadcrumbTextTargetTest() {
  const { handleSelectBreadcrumbNode, nav, onSelectNode } = createNavHarness({
    activeNodeId: 'child',
    nodesById: {
      root: createTopicNode('root', null, 'Root'),
      child: createTopicNode('child', 'root', 'Child', {
        id: 'hl-1',
        kind: 'highlight',
        locator: { from: 6, originalText: 'Beta', to: 10 }
      })
    }
  });

  nav.onSelectBreadcrumbNode('root');

  expect(onSelectNode).toHaveBeenCalledWith('root', {
    id: 'hl-1',
    kind: 'highlight',
    locator: { from: 6, originalText: 'Beta', to: 10 }
  });
  expect(handleSelectBreadcrumbNode).not.toHaveBeenCalled();
}

function runPdfBreadcrumbTargetTest() {
  const { handleSelectBreadcrumbNode, nav, onSelectNode } = createNavHarness({
    activeNodeId: 'pdf-highlight',
    nodesById: {
      pdf: createTopicNode('pdf', null, 'PDF'),
      'pdf-highlight': createTopicNode('pdf-highlight', 'pdf', 'PDF highlight', {
        id: 'pdf-hl-1',
        kind: 'highlight',
        locator: { page: 4, x: 0.2, y: 0.4 }
      })
    }
  });

  nav.onSelectBreadcrumbNode('pdf');

  expect(onSelectNode).toHaveBeenCalledWith('pdf', {
    id: 'pdf-hl-1',
    kind: 'highlight',
    locator: { page: 4, x: 0.2, y: 0.4 }
  });
  expect(handleSelectBreadcrumbNode).not.toHaveBeenCalled();
}

function runDirectTextAnchorJumpTest() {
  const { nav, onSelectNode } = createNavHarness({
    activeNodeId: 'other',
    nodesById: {}
  });

  nav.onSelectNode('target-node', {
    id: 'hl-2',
    kind: 'highlight',
    locator: { from: 12, originalText: 'Needle', to: 18 }
  });

  expect(onSelectNode).toHaveBeenCalledWith('target-node', {
    id: 'hl-2',
    kind: 'highlight',
    locator: { from: 12, originalText: 'Needle', to: 18 }
  });
}

describe('createLayoutNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes breadcrumb text targets through the shared node selection entry', () => {
    runBreadcrumbTextTargetTest();
  });

  it('routes pdf breadcrumb target through the shared node selection entry', () => {
    runPdfBreadcrumbTargetTest();
  });

  it('routes direct text-anchor node jumps through the same shared node selection entry', () => {
    runDirectTextAnchorJumpTest();
  });
});
