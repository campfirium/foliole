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

import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { installWorkspaceDebugBridge } from './workspaceDebugBridge';

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  getRuntimeInvoke.mockReturnValue(null);
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-04-09T00:00:00.000Z')));
  delete (window as Window & { __folioleWorkspaceDebug?: unknown }).__folioleWorkspaceDebug;
});

it('opens debug nodes through the prepared open path', async () => {
  installWorkspaceDebugBridge();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: { openNode: (nodeId: string) => Promise<boolean> };
  }).__folioleWorkspaceDebug;

  const opened = await debugApi?.openNode('node-1');

  expect(opened).toBe(true);
  expect(openWorkspaceNodeWithPreparedDocument).toHaveBeenCalledWith('node-1');
});

it('reads active node id and saved node view state through the debug bridge', () => {
  useWorkspaceStore.setState((state) => ({
    ...state,
    activeNodeId: 'node-2',
    nodeViewById: {
      ...state.nodeViewById,
      'node-2': {
        scrollTop: 5400,
        selection: { from: 48000, to: 48024 }
      }
    }
  }));

  installWorkspaceDebugBridge();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: {
      getActiveNodeId: () => string | null;
      getNodeViewState: (nodeId: string) => { scrollTop: number; selection: { from: number; to: number } } | null;
    };
  }).__folioleWorkspaceDebug;

  expect(debugApi?.getActiveNodeId()).toBe('node-2');
  expect(debugApi?.getNodeViewState('node-2')).toEqual({
    scrollTop: 5400,
    selection: { from: 48000, to: 48024 }
  });
  expect(debugApi?.getNodeViewState('missing-node')).toBeNull();
});

it('persists seeded debug nodes and imports debug attachments through the native runtime when available', async () => {
  const runtimeInvoke = vi.fn(async (command: string) => {
    if (command === 'import_clipboard_image_attachment') {
      return { attachment_id: 'hash-1' };
    }
    return null;
  });
  getRuntimeInvoke.mockReturnValue(runtimeInvoke);

  installWorkspaceDebugBridge();
  const debugApi = (window as Window & {
    __folioleWorkspaceDebug?: {
      importClipboardImageAttachment: (args: {
        bytesBase64: string;
        mimeType: string;
        nodeId: string;
        originalName?: string;
      }) => Promise<string | null>;
      seedNodes: (nodes: Array<{
        content: string;
        id: string;
        kind?: 'folder' | 'item' | 'topic';
        title: string;
      }>) => Promise<void>;
    };
  }).__folioleWorkspaceDebug;

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
