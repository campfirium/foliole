import { expect, it } from 'vitest';

import { createTestWorkspaceState } from '../test/workspaceStateTestSupport';

import { enforceWorkspaceRendererBoundary, getNodeDocumentStatus, isNodeDocumentLoaded } from './workspaceRendererBoundary';
import type { WorkspaceState } from './workspaceStore';

it('treats empty content with unknown metadata as not yet loaded', () => {
  const currentState = createTestWorkspaceState();
  const seedNode = currentState.nodesById['node-1']!;

  const nextState = enforceWorkspaceRendererBoundary(
    {
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...currentState.nodesById,
        'node-1': {
          ...seedNode,
          id: 'node-1',
          title: 'Node 1',
          content: 'First node body',
          hasContent: true,
          reveal: null,
          hasReveal: false
        },
        'node-2': {
          ...seedNode,
          id: 'node-2',
          title: 'Node 2',
          content: '',
          hasContent: undefined,
          reveal: null,
          hasReveal: false
        }
      },
      trashedNodeIds: []
    } as unknown as Partial<WorkspaceState>,
    currentState as WorkspaceState & { rendererBoundaryKeepNodeIds?: string[] }
  ) as { nodesById: Record<string, { content: string; hasContent?: boolean }> };

  expect(nextState.nodesById['node-2']!).toMatchObject({
    content: '',
    hasContent: undefined
  });
});

it('resolves explicit body status before boolean content metadata', () => {
  expect(getNodeDocumentStatus({ content: '', reveal: null, bodyStatus: 'empty', hasContent: true, hasReveal: false })).toBe('empty');
  expect(isNodeDocumentLoaded({ content: '', reveal: null, bodyStatus: 'empty', hasContent: true, hasReveal: false })).toBe(true);
  expect(getNodeDocumentStatus({ content: '', reveal: null, bodyStatus: 'failed', hasContent: true, hasReveal: false })).toBe('failed');
  expect(isNodeDocumentLoaded({ content: '', reveal: null, bodyStatus: 'failed', hasContent: true, hasReveal: false })).toBe(false);
  expect(getNodeDocumentStatus({ content: '', reveal: null, bodyStatus: 'missing', hasContent: true, hasReveal: false })).toBe('missing');
  expect(getNodeDocumentStatus({ content: '', reveal: null, bodyStatus: 'fetching', hasContent: true, hasReveal: false })).toBe('fetching');
  expect(getNodeDocumentStatus({ content: 'Ready body', reveal: null, bodyStatus: 'ready', hasContent: true, hasReveal: false })).toBe('ready');
});

it('keeps body status when trimming documents at the renderer boundary', () => {
  const currentState = createTestWorkspaceState();
  const seedNode = currentState.nodesById['node-1']!;

  const nextState = enforceWorkspaceRendererBoundary(
    {
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {
        ...currentState.nodesById,
        'node-1': {
          ...seedNode,
          id: 'node-1',
          title: 'Node 1',
          bodyStatus: 'failed',
          content: '',
          hasContent: true,
          reveal: null,
          hasReveal: false
        },
        'node-2': {
          ...seedNode,
          id: 'node-2',
          title: 'Node 2',
          content: 'Ready body',
          hasContent: true,
          reveal: null,
          hasReveal: false
        }
      },
      trashedNodeIds: []
    } as unknown as Partial<WorkspaceState>,
    currentState as WorkspaceState & { rendererBoundaryKeepNodeIds?: string[] }
  ) as { nodesById: Record<string, { bodyStatus?: string; content: string }> };

  expect(nextState.nodesById['node-1']!).toMatchObject({
    bodyStatus: 'failed',
    content: ''
  });
});
