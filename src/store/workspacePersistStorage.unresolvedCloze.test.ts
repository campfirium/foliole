import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendReadingPositionTraceLog, getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';
import { stagePendingUnresolvedClozeChildNode } from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/bridge', () => ({
  appendReadingPositionTraceLog: vi.fn(),
  getRuntimeInvoke: vi.fn()
}));

function createRuntimeSnapshot() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['node-2', 'node-cloze'],
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
      'node-cloze': {
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
          kind: 'cloze',
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

describe('workspacePersistStorage unresolved cloze anchors pending replay', () => {
  it('rehydrates pending child clozes as unresolved zero-width anchors after the parent text deletes the selection', async () => {
    stagePendingUnresolvedClozeChildNode();
    const invoke = createRuntimeInvoke();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

    expect(state?.nodesById['node-cloze']).toMatchObject({
      title: 'Alpha [...] Gamma',
      content: 'Alpha [...] Gamma',
      reveal: 'Beta',
      anchorLink: {
        id: 'cloze-1',
        kind: 'cloze',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    });
    expect(invoke).toHaveBeenCalledWith('update_node_content', expect.objectContaining({
      nodeId: 'node-cloze',
      title: 'Alpha [...] Gamma',
      content: 'Alpha [...] Gamma',
      reveal: 'Beta'
    }));
  });
});

describe('workspacePersistStorage hydrated cloze anchors edited-word recovery', () => {
  it('marks hydrated child clozes unresolved when the loaded parent text no longer contains the stored text', async () => {
    const invoke = createHydrateInvoke(createChangedParentSnapshot(), 'Alpha Better Gamma');
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

    expect(state?.nodesById['node-cloze']).toMatchObject({
      title: 'Alpha [...] Gamma',
      content: '',
      reveal: null,
      anchorLink: {
        id: 'cloze-1',
        kind: 'cloze',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 6
        }
      }
    });
    expect(invoke).not.toHaveBeenCalledWith('update_node_content', expect.objectContaining({
      nodeId: 'node-cloze'
    }));
  });
});
