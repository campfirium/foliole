// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { splitTopic } from '../database/splitTopicMutation.js';

import { handleInvokeRequest } from './commands.js';

const mockWindow = { close: vi.fn(), isMaximized: vi.fn(() => false), maximize: vi.fn(), minimize: vi.fn(), unmaximize: vi.fn() };

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./paths.js', () => ({
  resolveAppPaths: vi.fn().mockReturnValue({
    app_cache_dir: '/cache',
    app_config_dir: '/config',
    app_data_dir: '/data',
    app_log_dir: '/log'
  })
}));
vi.mock('../database/splitTopicMutation.js', () => ({ splitTopic: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(splitTopic).mockReturnValue({
    activeNodeId: 'part-a',
    createdNodeIds: ['part-a', 'part-b'],
    deletedNodeIds: ['source'],
    nodeOrder: ['source', 'part-a', 'part-b'],
    nodes: []
  });
});

function topicArgs(nodeId: string, position: number) {
  return {
    anchorLink: null,
    content: `# ${nodeId}`,
    createdAt: '2026-07-28T00:00:00.000Z',
    isTitleManual: false,
    kind: 'topic',
    nodeId,
    parentNodeId: null,
    position,
    reveal: null,
    title: nodeId,
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
}

it('handles split Topic mutation command with a typed atomic payload', async () => {
  await expect(handleInvokeRequest({
    command: 'split_topic',
    args: {
      activeNodeId: 'part-a',
      deletedAt: '2026-07-28T00:01:00.000Z',
      disposition: 'replace',
      generatedNodes: [topicArgs('part-a', 1), topicArgs('part-b', 2)],
      nodeOrder: ['source', 'part-a', 'part-b'],
      sourceNodeId: 'source',
      sourceParentNodeId: null
    }
  })).resolves.toEqual({
    activeNodeId: 'part-a',
    createdNodeIds: ['part-a', 'part-b'],
    deletedNodeIds: ['source'],
    nodeOrder: ['source', 'part-a', 'part-b'],
    nodes: []
  });
  expect(splitTopic).toHaveBeenCalledWith(expect.objectContaining({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [expect.objectContaining({ nodeId: 'part-a' }), expect.objectContaining({ nodeId: 'part-b' })],
    nodeOrder: ['source', 'part-a', 'part-b'],
    sourceNodeId: 'source',
    sourceParentNodeId: null
  }));
});

it('rejects split Topic payloads with an active Topic outside generated nodes', async () => {
  await expect(handleInvokeRequest({
    command: 'split_topic',
    args: {
      activeNodeId: 'missing',
      deletedAt: '2026-07-28T00:01:00.000Z',
      disposition: 'replace',
      generatedNodes: [topicArgs('part-a', 1)],
      nodeOrder: ['source', 'part-a'],
      sourceNodeId: 'source',
      sourceParentNodeId: null
    }
  })).rejects.toThrow('invalid argument: activeNodeId');
  expect(splitTopic).not.toHaveBeenCalled();
});

it('accepts Keep without deletedAt and rejects disposition parent mismatches', async () => {
  vi.mocked(splitTopic).mockReturnValue({ activeNodeId: 'part-a', createdNodeIds: ['part-a'], deletedNodeIds: [], nodeOrder: ['source', 'part-a'], nodes: [] });
  await expect(handleInvokeRequest({
    command: 'split_topic',
    args: {
      activeNodeId: 'part-a',
      disposition: 'keep-as-parent',
      generatedNodes: [{ ...topicArgs('part-a', 1), parentNodeId: 'source' }],
      nodeOrder: ['source', 'part-a'],
      sourceNodeId: 'source',
      sourceParentNodeId: null
    }
  })).resolves.toMatchObject({ deletedNodeIds: [] });

  await expect(handleInvokeRequest({
    command: 'split_topic',
    args: {
      activeNodeId: 'part-a',
      deletedAt: '2026-07-28T00:01:00.000Z',
      disposition: 'keep-as-parent',
      generatedNodes: [{ ...topicArgs('part-a', 1), parentNodeId: null }],
      nodeOrder: ['source', 'part-a'],
      sourceNodeId: 'source',
      sourceParentNodeId: null
    }
  })).rejects.toThrow();
});
