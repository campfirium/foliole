import { beforeEach, expect, it, vi } from 'vitest';

import { saveSplitTopicWorkspaceMutation } from '../../shared/platform/workspaceRuntimeRepository';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { createInitialWorkspaceState, useWorkspaceStore } from '../../store/workspaceStore';

import { confirmSplitTopic } from './SplitTopicDialogMutation';

vi.mock('../../shared/platform/workspaceRuntimeRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/platform/workspaceRuntimeRepository')>()),
  saveSplitTopicWorkspaceMutation: vi.fn()
}));
vi.mock('../../shared/platform/desktop/splitTopicPreferences', () => ({ saveSplitTopicPreferences: vi.fn() }));
vi.mock('../../store/workspaceRefreshScheduler', () => ({ refreshWorkspaceState: vi.fn() }));

beforeEach(() => {
  vi.mocked(refreshWorkspaceState).mockReset();
  vi.mocked(saveSplitTopicWorkspaceMutation).mockReset();
  const initial = createInitialWorkspaceState(new Date('2026-10-08T00:00:00.000Z'));
  const source = { ...initial.nodesById['node-1']!, id: 'source', parentNodeId: null };
  useWorkspaceStore.setState({ ...initial, nodeOrder: ['source'], nodesById: { source } });
});

function confirm() {
  return confirmSplitTopic({
    form: { delimiter: '---', disposition: 'replace', footerText: '', headerText: '', keepDelimiter: false },
    preview: [{ body: 'Alpha', title: 'Alpha' }] as Parameters<typeof confirmSplitTopic>[0]['preview'],
    source: { content: 'Alpha', parentNodeId: null, revision: 'a'.repeat(64) },
    sourceNodeId: 'source'
  });
}

function returnChildOrder(childId: string) {
  vi.mocked(saveSplitTopicWorkspaceMutation).mockImplementation(async (args) => ({
    activeNodeId: args.activeNodeId, deletedNodeIds: [args.sourceNodeId], nodes: [],
    childOrders: [{ parentNodeId: null, childIds: [childId] }]
  }));
}

it('reloads before applying child orders that name a node the workspace lacks', async () => {
  returnChildOrder('unloaded');
  vi.mocked(refreshWorkspaceState).mockImplementation(async () => {
    expect(useWorkspaceStore.getState().trashedNodeIds).not.toContain('source');
  });
  await confirm();
  expect(refreshWorkspaceState).toHaveBeenCalledOnce();
  expect(useWorkspaceStore.getState().trashedNodeIds).toContain('source');
});

it('applies child orders without reloading when the workspace holds every named node', async () => {
  returnChildOrder('source');
  await confirm();
  expect(refreshWorkspaceState).not.toHaveBeenCalled();
});
