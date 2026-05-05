import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';
import { readWorkspaceNodesFromPayload } from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2', 'node-3'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: true, reveal: null },
          'node-3': { id: 'node-3', content: '', hasContent: true, hasReveal: true, reveal: null }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document') {
      if (payload?.nodeId !== 'node-2') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Loaded node 2 body',
        hideTitleHeading: false,
        reveal: 'Loaded node 2 answer'
      });
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

function createLongDocument() {
  return Array.from({ length: 2_500 }, (_, index) => `Paragraph ${index}: ${'Long document body. '.repeat(4)}`).join('\n\n');
}

function createLongDocumentRuntimeInvoke(longDocument: string) {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-2',
        nodeOrder: ['node-1', 'node-2'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document' && payload?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: longDocument,
        hideTitleHeading: false,
        reveal: null
      });
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

function createNearTermDirectionRuntimeInvoke(longDocument: string) {
  return vi.fn().mockImplementation((command: string, payload?: { nodeId?: string }) => {
    if (command === 'load_workspace_snapshot') {
      throw new Error('full workspace snapshot should not be used for renderer hydrate');
    }
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve({
        activeNodeId: 'node-1',
        nodeOrder: ['node-1', 'node-2'],
        nodesById: {
          'node-1': { id: 'node-1', content: '', hasContent: true, hasReveal: false, reveal: null },
          'node-2': { id: 'node-2', content: '', hasContent: true, hasReveal: false, reveal: null }
        },
        trashedNodeIds: []
      });
    }
    if (command === 'load_node_document' && payload?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: longDocument,
        hideTitleHeading: false,
        reveal: null
      });
    }
    if (command === 'load_reading_progress') {
      return Promise.resolve({
        activeNodeId: 'node-2',
        nodeViewStateById: {
          'node-2': {
            scrollTop: 5_400,
            selectionFrom: 48_000,
            selectionTo: 48_024,
            updatedAt: '2026-03-29T00:00:00.000Z'
          }
        }
      });
    }
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
});

it('loads only the active node document from runtime hydrate', async () => {
  const invoke = createRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
  const nodesById = readWorkspaceNodesFromPayload(value);
  const loadDocumentCalls = invoke.mock.calls.filter(([command]) => command === 'load_node_document');

  expect(loadDocumentCalls).toEqual([['load_node_document', { nodeId: 'node-2' }]]);
  expect(nodesById?.['node-1']).toEqual({
    id: 'node-1',
    content: '',
    hasContent: true,
    hasReveal: false,
    reveal: null
  });
  expect(nodesById?.['node-2']).toEqual({
    id: 'node-2',
    content: 'Loaded node 2 body',
    hasContent: true,
    hasReveal: true,
    hideTitleHeading: false,
    reveal: 'Loaded node 2 answer'
  });
  expect(nodesById?.['node-3']).toEqual({
    id: 'node-3',
    content: '',
    hasContent: true,
    hasReveal: true,
    reveal: null
  });
});

it('allows first open of a long document to load the full body from runtime hydrate', async () => {
  const longDocument = createLongDocument();
  const invoke = createLongDocumentRuntimeInvoke(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
  const nodesById = readWorkspaceNodesFromPayload(value);

  expect(invoke).toHaveBeenCalledWith('load_node_document', { nodeId: 'node-2' });
  expect(nodesById?.['node-2']?.content).toBe(longDocument);
  expect(nodesById?.['node-2']?.content.length).toBeGreaterThan(100_000);
  expect(nodesById?.['node-1']?.content).toBe('');
});

it('hydrates the default near-term route with lightweight nodes, separate view state, and on-demand content only', async () => {
  const longDocument = createLongDocument();
  const invoke = createNearTermDirectionRuntimeInvoke(longDocument);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const value = await workspacePersistStorage.getItem('foliole-workspace-v1');
  const parsed = JSON.parse(value ?? 'null') as {
    state: {
      activeNodeId: string | null;
      nodeViewById: Record<string, { scrollTop: number; selection: { from: number; to: number } }>;
      nodesById: Record<string, { content: string; hasContent: boolean; reveal: string | null }>;
    };
  } | null;

  expect(parsed?.state.activeNodeId).toBe('node-2');
  expect(parsed?.state.nodeViewById['node-2']).toEqual({
    scrollTop: 5_400,
    selection: { from: 48_000, to: 48_024 }
  });
  expect(parsed?.state.nodesById['node-1']).toMatchObject({
    content: '',
    hasContent: true,
    reveal: null
  });
  expect(parsed?.state.nodesById['node-2']?.content).toBe(longDocument);
  expect(parsed?.state.nodesById['node-2']?.content.length).toBeGreaterThan(100_000);
  expect(invoke.mock.calls.filter(([command]) => command === 'load_node_document')).toEqual([
    ['load_node_document', { nodeId: 'node-2' }]
  ]);
  expect(invoke.mock.calls.some(([command]) => command === 'load_workspace_snapshot')).toBe(false);
});
