import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendReadingPositionTraceLog, getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';
import { stagePendingUnresolvedAnchorChildNode } from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/bridge', () => ({
  appendReadingPositionTraceLog: vi.fn(),
  getRuntimeInvoke: vi.fn()
}));

function createRuntimeSnapshot() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['node-2', 'node-highlight'],
    nodesById: {
      'node-2': {
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
      },
      'node-highlight': {
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
          kind: 'highlight',
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
      }
    },
    trashedNodeIds: []
  };
}

function createRuntimeInvoke() {
  return createHydrateInvoke(createRuntimeSnapshot(), 'Alpha  Gamma');
}

function createHydrateInvoke(snapshot: ReturnType<typeof createRuntimeSnapshot>, content: string) {
  return vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve(snapshot);
    }
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        kind: 'topic',
        content,
        hideTitleHeading: false,
        reveal: null
      });
    }
    if (command === 'update_node_content') {
      return Promise.resolve(null);
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

function createChangedParentSnapshot() {
  return createRuntimeSnapshot();
}

function readHydratedState(value: string | null) {
  return value
    ? (JSON.parse(value) as {
        state: {
          nodesById: Record<string, { anchorLink?: unknown; content: string; reveal: string | null; title?: string }>;
        };
      }).state
    : null;
}

function resetHydrateMocks() {
  vi.restoreAllMocks();
  vi.mocked(appendReadingPositionTraceLog).mockReset();
  vi.mocked(getRuntimeInvoke).mockReset();
  window.localStorage.clear();
}

beforeEach(() => {
  resetHydrateMocks();
});

describe('workspacePersistStorage unresolved text anchors pending replay', () => {
  it('rehydrates pending child highlights as unresolved zero-width anchors after the parent text deletes the selection', async () => {
    stagePendingUnresolvedAnchorChildNode();
    const invoke = createRuntimeInvoke();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

    expect(state?.nodesById['node-highlight']).toMatchObject({
      title: 'Beta',
      content: 'Beta',
      reveal: null,
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    });
    expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
      nodeId: 'node-highlight',
      title: 'Beta',
      content: 'Beta',
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    }));
  });
});

describe('workspacePersistStorage hydrated text anchors edited-word recovery', () => {
  it('keeps hydrated child highlights at their stored offsets when the loaded parent text changes', async () => {
    const invoke = createHydrateInvoke(createChangedParentSnapshot(), 'Alpha Better Gamma');
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

    expect(state?.nodesById['node-highlight']).toMatchObject({
      title: 'Beta',
      content: '',
      reveal: null,
      anchorLink: {
        id: 'hl-1',
        kind: 'highlight',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 10
        }
      }
    });
    expect(invoke).not.toHaveBeenCalledWith('update_node_content', expect.objectContaining({
      nodeId: 'node-highlight'
    }));
  });
});
