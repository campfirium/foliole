import { beforeEach, expect, it, vi } from 'vitest';

const { openWorkspaceNodeWithPreparedDocument } = vi.hoisted(() => ({
  openWorkspaceNodeWithPreparedDocument: vi.fn()
}));
const { getRuntimeInvoke } = vi.hoisted(() => ({
  getRuntimeInvoke: vi.fn()
}));

vi.mock('../../store/workspaceNodePreparation', () => ({
  openWorkspaceNodeWithPreparedDocument
}));
vi.mock('../platform/bridge', () => ({
  getRuntimeInvoke
}));
vi.mock('../platform/runtimeInvoke', () => ({
  getRuntimeInvoke
}));

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { installWorkspaceDebugBridge } from './workspaceDebugBridge';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  getRuntimeInvoke.mockReturnValue(null);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z')));
  useWorkspaceStore.getState().createRootNode('');
  delete (window as Window & { __folioleWorkspaceDebug?: unknown }).__folioleWorkspaceDebug;
});

function getSeedNodeId() {
  const seedNode = useWorkspaceStore
    .getState()
    .nodeOrder.find((nodeId) => useWorkspaceStore.getState().nodesById[nodeId]?.specialKind == null);
  if (!seedNode) {
    throw new Error('missing seed node');
  }
  return seedNode;
}

it('opens debug nodes through the prepared open path', async () => {
  installWorkspaceDebugBridge();
  const seedNodeId = getSeedNodeId();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: { openNode: (nodeId: string) => Promise<boolean> };
  }).__folioleWorkspaceDebug;

  const opened = await debugApi?.openNode(seedNodeId);

  expect(opened).toBe(true);
  expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith(seedNodeId);
});

function getDebugApi() {
  return (window as Window & {
    __folioleWorkspaceDebug?: {
      createTextClozeChild: (args: {
        anchorId: string;
        answer: string;
        parentNodeId: string;
        prompt: string;
      }) => Promise<string | null>;
      createTextHighlightChild: (args: {
        anchorId: string;
        parentNodeId: string;
        text: string;
      }) => Promise<string | null>;
      deleteNode: (nodeId: string) => Promise<boolean>;
      deleteNodePermanently: (nodeId: string) => Promise<boolean>;
      getActiveNodeId: () => string | null;
      getNode: (nodeId: string) => {
        anchorKind: 'highlight' | 'cloze' | null;
        content: string;
        id: string;
        parentNodeId: string | null;
        reveal: string | null;
        title: string;
        trashed: boolean;
      } | null;
      getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } | null } | null;
      importClipboardImageAttachment: (args: {
        bytesBase64: string;
        mimeType: string;
        nodeId: string;
        originalName?: string;
      }) => Promise<string | null>;
      restoreNode: (nodeId: string) => Promise<boolean>;
      setNodeViewState: (args: { from: number; nodeId: string; scrollTop?: number; to: number }) => boolean;
      seedNodes: (nodes: Array<{
        content: string;
        id: string;
        kind?: 'folder' | 'item' | 'topic';
        title: string;
      }>) => Promise<void>;
      updateNodeContent: (nodeId: string, content: string) => Promise<boolean>;
    };
  }).__folioleWorkspaceDebug;
}

function setNodeViewState() {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'debug-node-1',
    nodeViewById: {
      ...state.nodeViewById,
      'debug-node-1': {
        scrollTop: 5400,
        selection: { from: 48000, to: 48024 }
      }
    }
  }));
}

async function seedSingleDebugNode() {
  await getDebugApi()?.seedNodes([
    {
      content: 'Seed body',
      id: 'debug-node-1',
      kind: 'topic',
      title: 'Debug Node 1'
    }
  ]);
}

it('reads active node id and saved node view state through the debug bridge', async () => {
  installWorkspaceDebugBridge();
  await seedSingleDebugNode();
  setNodeViewState();
  const debugApi = getDebugApi();

  expect(debugApi?.getActiveNodeId()).toBe('debug-node-1');
  expect(debugApi?.getNodeViewState('debug-node-1')).toEqual({
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 }
  });
  expect(debugApi?.setNodeViewState({ from: 12, nodeId: 'debug-node-1', scrollTop: 345, to: 18 })).toBe(true);
  expect(debugApi?.getNodeViewState('debug-node-1')).toMatchObject({
    scrollTop: 345,
    selection: { from: 12, to: 18 }
  });
  expect(debugApi?.getNodeViewState('missing-node')).toBeNull();

  const updated = await debugApi?.updateNodeContent('debug-node-1', 'Alpha Beta');
  const createdHighlightId = await debugApi?.createTextHighlightChild({
    anchorId: 'hl-debug-1',
    parentNodeId: 'debug-node-1',
    text: 'Alpha'
  });
  const createdClozeId = await debugApi?.createTextClozeChild({
    anchorId: 'cloze-debug-1',
    answer: 'Alpha',
    parentNodeId: 'debug-node-1',
    prompt: '[...] Beta'
  });

  expect(createdHighlightId).toBeTruthy();
  expect(createdClozeId).toBeTruthy();
  expect(updated).toBe(true);
  expect(typeof debugApi?.deleteNode).toBe('function');
  expect(typeof debugApi?.restoreNode).toBe('function');
  expect(typeof debugApi?.deleteNodePermanently).toBe('function');
  expect(debugApi?.getNode('debug-node-1')).toMatchObject({
    content: 'Alpha Beta',
    id: 'debug-node-1',
    title: 'Debug Node 1',
    trashed: false
  });
  expect(useWorkspaceStore.getState().nodesById['debug-node-1']?.content).toBe('Alpha Beta');
});

it('persists seeded debug nodes and imports debug attachments through the native runtime when available', async () => {
  const runtimeInvoke = vi.fn(async (command: string) => {
    if (command === 'import_clipboard_image_attachment') {
      return {
        status: 'imported',
        attachment_id: 'hash-1',
        attachment_record: 'created',
        created_at: '2026-04-09T00:00:00.000Z',
        hash: 'hash-1',
        mime_type: 'image/png',
        original_name: 'debug-image.png',
        size_bytes: 5,
        stored_file: 'created'
      };
    }
    return null;
  });
  getRuntimeInvoke.mockReturnValue(runtimeInvoke);

  installWorkspaceDebugBridge();
  const debugApi = getDebugApi();

  await debugApi?.seedNodes([
    {
      content: '![Cover](asset://hash-1.png)',
      id: 'topic-image-cloze',
      kind: 'topic',
      title: 'Playwright Image Cloze Topic'
    }
  ]);
  const attachmentId = await debugApi?.importClipboardImageAttachment({
    bytesBase64: 'aGVsbG8=',
    mimeType: 'image/png',
    nodeId: 'topic-image-cloze'
  });

  expect(runtimeInvoke).toHaveBeenCalledWith(
    'create_topic',
    expect.objectContaining({
      content: '![Cover](asset://hash-1.png)',
      imageRegions: null,
      nodeId: 'topic-image-cloze',
      title: 'Playwright Image Cloze Topic'
    })
  );
  expect(runtimeInvoke).toHaveBeenCalledWith('replace_node_order', { nodeIds: ['topic-image-cloze'] });
  expect(runtimeInvoke).toHaveBeenCalledWith(
    'import_clipboard_image_attachment',
    expect.objectContaining({
      mimeType: 'image/png',
      nodeId: 'topic-image-cloze',
      originalName: 'debug-image.png'
    })
  );
  expect(attachmentId).toBe('hash-1');
});
