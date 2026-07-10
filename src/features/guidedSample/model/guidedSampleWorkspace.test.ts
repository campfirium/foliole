import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLiveReviewQueueOutput } from '../../../store/workspaceReviewLiveQueue';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../../store/workspaceStore';
import { INBOX_NODE_ID } from '../../nodes/model/specialNodes';

import { GUIDED_SAMPLE_MARKER } from './guidedSampleContent';
import { ensureGuidedSampleTopicTree, findGuidedSampleRootNodeId } from './guidedSampleWorkspace';

const { importGuidedSampleTopicAssets } = vi.hoisted(() => ({
  importGuidedSampleTopicAssets: vi.fn(async () => undefined)
}));

vi.mock('./guidedSampleAssetImports', () => ({ importGuidedSampleTopicAssets }));

function resetWorkspaceStore() {
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-05-31T00:00:00.000Z')));
}

function directChildIds(rootNodeId: string) {
  const state = useWorkspaceStore.getState();
  return state.nodeOrder.filter((nodeId) => state.nodesById[nodeId]?.parentNodeId === rootNodeId);
}

function expectChineseGuidedSampleCopy(result: Awaited<ReturnType<typeof ensureGuidedSampleTopicTree>>) {
  const state = useWorkspaceStore.getState();
  const rootNode = result.rootNodeId ? state.nodesById[result.rootNodeId] : null;
  const readingNode = state.nodesById[result.queueNodeIds[1] ?? ''];
  expect(rootNode?.content).toContain('请先点击底部动作条里的 Read，或按 3 或 F。');
  expect(readingNode?.content).toContain('在 Foliole 中，阅读不必一次完成。');
  expect(readingNode?.content).toContain('如果没有看到底部动作条，请点击左下角的“进入 Flow”按钮。');
  expect(readingNode?.content).toContain('![image](asset://');
}

describe('ensureGuidedSampleTopicTree', () => {
  beforeEach(() => {
    localStorage.clear();
    importGuidedSampleTopicAssets.mockClear();
    resetWorkspaceStore();
  });

  it('creates one ordered simplified Chinese sample tree in an empty workspace', async () => {
    const result = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState(), ['zh-CN']);

    expect(result).toMatchObject({ locale: 'zh-CN', wasCreated: true, wasWorkspaceEmpty: true });
    expect(result.rootNodeId).toBeTruthy();
    const state = useWorkspaceStore.getState();
    const rootNode = result.rootNodeId ? state.nodesById[result.rootNodeId] : null;
    expect(rootNode?.title).toBe('欢迎使用 Foliole');
    expect(rootNode?.hasContent).toBe(true);
    expect(rootNode?.content).not.toContain(GUIDED_SAMPLE_MARKER);
    expectChineseGuidedSampleCopy(result);
    expect(directChildIds(result.rootNodeId ?? '')).toHaveLength(7);
    expect(result.queueNodeIds.map((nodeId) => state.nodesById[nodeId]?.priority)).toEqual(Array(8).fill(0));
    expect(rootNode?.sequentialReadingEnabled).toBeUndefined();
    expect(importGuidedSampleTopicAssets).toHaveBeenCalledTimes(8);
    expect(result.queueNodeIds).toEqual([
      result.rootNodeId,
      ...directChildIds(result.rootNodeId ?? '')
    ]);
    expect(buildLiveReviewQueueOutput(
      { ...state, reviewSessionMode: 'reading-only' },
      '2099-05-31T00:00:00.000Z'
    ).taskNodeIds).toEqual(result.queueNodeIds);
    expect(state.nodesById[result.queueNodeIds[4] ?? '']?.title).toBe('检测：强化记忆');
    expect(state.nodesById[result.queueNodeIds[5] ?? '']?.title).toBe('改写：澄清理解');
  });

  it('does not treat traditional Chinese as Chinese sample content', async () => {
    const result = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState(), ['zh-TW']);
    const state = useWorkspaceStore.getState();
    const rootNode = result.rootNodeId ? state.nodesById[result.rootNodeId] : null;
    const readingNode = state.nodesById[result.queueNodeIds[1] ?? ''];

    expect(result.locale).toBe('en-US');
    expect(rootNode?.title).toBe('Welcome to Foliole');
    expect(rootNode?.content).toContain('Start by clicking Read in the bottom action bar, or press 3 or F.');
    expect(readingNode?.content).toContain('Reading does not need to be completed in one pass.');
    expect(readingNode?.content).toContain('If the bottom action bar is not visible, click Enter Flow in the bottom-left corner.');
    expect(readingNode?.content).toContain('![image](asset://');
  });

  it('reuses an existing visible sample instead of inserting a duplicate', async () => {
    const first = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState(), ['en-US']);
    const second = await ensureGuidedSampleTopicTree(() => useWorkspaceStore.getState(), ['en-US']);

    expect(second).toMatchObject({ rootNodeId: first.rootNodeId, wasCreated: false });
    expect(findGuidedSampleRootNodeId(useWorkspaceStore.getState())).toBe(first.rootNodeId);
    expect(useWorkspaceStore.getState().nodeOrder.filter((nodeId) => useWorkspaceStore.getState().nodesById[nodeId]?.title === 'Welcome to Foliole')).toHaveLength(1);
  });

});

describe('ensureGuidedSampleTopicTree asset imports', () => {
  beforeEach(() => {
    importGuidedSampleTopicAssets.mockClear();
    resetWorkspaceStore();
  });

  it('keeps the complete sample tree when packaged asset import fails', async () => {
    const onAssetImportError = vi.fn();
    importGuidedSampleTopicAssets.mockRejectedValueOnce(new Error('missing asset'));

    const result = await ensureGuidedSampleTopicTree(
      () => useWorkspaceStore.getState(),
      ['en-US'],
      { onAssetImportError }
    );

    expect(result.wasCreated).toBe(true);
    expect(directChildIds(result.rootNodeId ?? '')).toHaveLength(7);
    expect(onAssetImportError).toHaveBeenCalledOnce();
  });
});

describe('ensureGuidedSampleTopicTree runtime refresh', () => {
  it('continues from a refreshed root when runtime creation writes before renderer state updates', async () => {
    const baseState = createInitialWorkspaceState(new Date('2026-05-31T00:00:00.000Z'));
    const inboxNode = baseState.nodesById[INBOX_NODE_ID];
    if (!inboxNode) {
      throw new Error('missing inbox node');
    }
    const topicBase = { ...inboxNode };
    delete topicBase.specialKind;
    const runtimeNodes = { ...baseState.nodesById };
    const rendererState = {
      ...baseState,
      createRootNode: vi.fn(async (content = '') => {
        runtimeNodes['runtime-root'] = {
          ...topicBase,
          id: 'runtime-root',
          parentNodeId: INBOX_NODE_ID,
          kind: 'topic',
          title: 'Welcome to Foliole',
          content
        };
        return null;
      }),
      createChildNode: vi.fn(async (parentNodeId: string, content = '') => {
        const nodeId = `runtime-child-${rendererState.nodeOrder.length}`;
        rendererState.nodesById[nodeId] = {
          ...topicBase,
          id: nodeId,
          parentNodeId,
          kind: 'topic',
          title: content.split('\n')[0]?.replace(/^#\s*/, '') ?? 'Untitled',
          content
        };
        rendererState.nodeOrder.push(nodeId);
        return nodeId;
      }),
    };
    const refreshWorkspaceState = vi.fn(async () => {
      rendererState.nodesById = { ...rendererState.nodesById, ...runtimeNodes };
      rendererState.nodeOrder = [INBOX_NODE_ID, 'runtime-root'];
    });

    const result = await ensureGuidedSampleTopicTree(
      () => rendererState,
      ['en-US'],
      { refreshWorkspaceState }
    );

    expect(result.rootNodeId).toBe('runtime-root');
    expect(refreshWorkspaceState).toHaveBeenCalled();
    expect(rendererState.createRootNode).toHaveBeenCalledWith(expect.any(String), 'topic', { priority: 0 });
    expect(rendererState.createChildNode).toHaveBeenCalledWith('runtime-root', expect.any(String), 'topic', { priority: 0 });
    expect(rendererState.createChildNode).toHaveBeenCalledTimes(7);
  });
});
