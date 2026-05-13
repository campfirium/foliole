import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendReadingPositionTraceLog } from '../shared/platform/readingPositionTraceRuntimeRepository';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { workspacePersistStorage } from './workspacePersistStorage';
import {
  createUpdatedChildAnchorRuntimeInvoke,
  expectReplayedUpdatedChildHighlight,
  readHydratedState
} from './workspacePersistStorage.rendererBoundary.test-support';
import { stagePendingAnchorChildNode, stagePendingNodeDocument } from './workspacePersistStorage.test-support';

vi.mock('../shared/platform/readingPositionTraceRuntimeRepository', () => ({
  appendReadingPositionTraceLog: vi.fn()
}));

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function createDefaultWorkspaceSnapshot() {
  return {
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: {
      'node-1': {
        id: 'node-1',
        content: 'Unexpected node 1 body',
        hasContent: true,
        hasReveal: false,
        reveal: null
      },
      'node-2': {
        id: 'node-2',
        content: '',
        hasContent: true,
        hasReveal: true,
        reveal: null
      },
      'node-3': {
        id: 'node-3',
        content: 'Unexpected node 3 body',
        hasContent: true,
        hasReveal: true,
        reveal: 'Unexpected node 3 answer'
      }
    },
    trashedNodeIds: []
  };
}

function createDefaultNodeDocument() {
  return {
    nodeId: 'node-2',
    content: 'Node 2 content',
    hideTitleHeading: false,
    reveal: 'Node 2 answer'
  };
}

function createRuntimeInvoke() {
  return vi.fn().mockImplementation((command: string) => {
    if (command === 'load_workspace_list_snapshot') {
      return Promise.resolve(createDefaultWorkspaceSnapshot());
    }
    if (command === 'load_node_document') {
      return Promise.resolve(createDefaultNodeDocument());
    }
    return Promise.resolve({ activeNodeId: 'node-2', nodeViewStateById: {} });
  });
}

async function runKeepsOnlyActiveAndPendingDocumentsCase() {
  stagePendingNodeDocument();
  vi.mocked(getRuntimeInvoke).mockReturnValue(createRuntimeInvoke());

  const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

  expect(state?.activeNodeId).toBe('node-2');
  expect(state?.nodesById['node-1']!).toMatchObject({
    content: 'Pending node 1 draft',
    reveal: null
  });
  expect(state?.nodesById['node-2']!).toMatchObject({
    content: 'Node 2 content',
    reveal: 'Node 2 answer'
  });
  expect(state?.nodesById['node-3']!).toMatchObject({
    content: '',
    reveal: null
  });
}

async function runPendingHighlightRehydrateCase() {
  stagePendingAnchorChildNode();
  const invoke = createUpdatedChildAnchorRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

  expect(state?.nodesById['node-highlight']!).toMatchObject({
    title: 'Better',
    content: 'Better',
    reveal: null,
    anchorLink: {
      id: 'hl-1',
      kind: 'highlight',
      locator: {
        from: 6,
        originalText: 'Better',
        to: 12
      }
    }
  });
  expectReplayedUpdatedChildHighlight(invoke);
}

async function runClozeRehydrateCase() {
  const invoke = createUpdatedChildAnchorRuntimeInvoke();
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  const state = readHydratedState(await workspacePersistStorage.getItem('foliole-workspace-v1'));

  expect(state?.nodesById['node-cloze']!).toMatchObject({
    title: 'Alpha [...] Gamma',
    content: '',
    reveal: null,
    anchorLink: {
      id: 'cloze-1',
      kind: 'cloze',
        locator: {
          from: 6,
          originalText: 'Beta',
          to: 10
        }
    }
  });
  expect(invoke).not.toHaveBeenCalledWith('update_node_content', expect.objectContaining({
    nodeId: 'node-cloze'
  }));
}

describe('workspacePersistStorage renderer boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(appendReadingPositionTraceLog).mockReset();
    vi.mocked(getRuntimeInvoke).mockReset();
    window.localStorage.clear();
  });

  it('keeps only active and pending node documents in the hydrate payload', runKeepsOnlyActiveAndPendingDocumentsCase);
  it('rehydrates pending child highlights with refreshed locator before runtime replay finishes', runPendingHighlightRehydrateCase);
  it('rehydrates child clozes with refreshed locator after the parent text changes', runClozeRehydrateCase);
});
