import { vi } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { NodeNavigationResult } from '../../store/workspaceNavigation';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

export const navigationTestNodes = {
  'node-1': {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic' as const,
    title: 'Node 1',
    content: '',
    reveal: null,
    review: null,
    createdAt: '',
    updatedAt: ''
  },
  'node-2': {
    id: 'node-2',
    parentNodeId: null,
    kind: 'topic' as const,
    title: 'Node 2',
    content: '',
    reveal: null,
    review: null,
    createdAt: '',
    updatedAt: ''
  },
  'pdf-parent': {
    id: 'pdf-parent',
    parentNodeId: null,
    kind: 'topic' as const,
    title: 'PDF Parent',
    content: '',
    reveal: null,
    review: null,
    createdAt: '',
    updatedAt: ''
  }
};

export function resetWorkspaceNavigationTestState() {
  window.localStorage.clear();
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z')));
}

export function seedPrefetchTestState() {
  useWorkspaceStore.setState({
    ...useWorkspaceStore.getState(),
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...navigationTestNodes,
      'node-1': {
        ...navigationTestNodes['node-1'],
        content: 'Loaded node 1 body',
        hasContent: true,
        hasReveal: false
      },
      'node-2': {
        ...navigationTestNodes['node-2'],
        content: '',
        hasContent: true,
        hasReveal: false
      }
    },
    trashedNodeIds: []
  });
}

export function createPrefetchInvokeMock() {
  return vi.fn().mockResolvedValue({
    content: 'Loaded node 2 body',
    hideTitleHeading: false,
    kind: 'topic',
    reveal: null,
    virtualFilter: null
  });
}

export function trackPrefetchCallOrder(
  diagnostics: {
    markNodeDocumentMerged: ReturnType<typeof vi.fn>;
    markNodeDocumentLoadResolved: ReturnType<typeof vi.fn>;
    markNodeDocumentLoadStarted: ReturnType<typeof vi.fn>;
    markNodeSelectionRequested: ReturnType<typeof vi.fn>;
  }
) {
  const callOrder: string[] = [];
  diagnostics.markNodeSelectionRequested.mockImplementation(() => {
    callOrder.push('selection-requested');
  });
  diagnostics.markNodeDocumentLoadStarted.mockImplementation(() => {
    callOrder.push('load-started');
  });
  diagnostics.markNodeDocumentLoadResolved.mockImplementation(() => {
    callOrder.push('load-resolved');
  });
  diagnostics.markNodeDocumentMerged.mockImplementation(() => {
    callOrder.push('load-merged');
  });
  return callOrder;
}

export function seedNavigationPrefetchState(args: {
  activeNodeId?: string;
  backStack?: string[];
  forwardStack?: string[];
  nodesById?: Record<string, Node>;
}) {
  useWorkspaceStore.setState({
    ...useWorkspaceStore.getState(),
    activeNodeId: args.activeNodeId ?? 'node-2',
    navigation: {
      backStack: args.backStack ?? [],
      forwardStack: args.forwardStack ?? []
    },
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...navigationTestNodes,
      'node-1': {
        ...navigationTestNodes['node-1'],
        content: '',
        hasContent: true,
        hasReveal: false
      },
      'node-2': {
        ...navigationTestNodes['node-2'],
        content: 'Loaded node 2 body',
        hasContent: true,
        hasReveal: false
      },
      ...(args.nodesById ?? {})
    },
    trashedNodeIds: []
  });
}

export function createNavigationActionMock(callOrder: string[], actionName: string, actionResult: NodeNavigationResult | null) {
  return vi.fn(() => {
    callOrder.push(actionName);
    return actionResult;
  });
}
