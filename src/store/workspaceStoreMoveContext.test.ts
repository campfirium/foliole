import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { resetWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createInitialWorkspaceState, useWorkspaceStore } from './workspaceStore';

vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

function createRuntimeInvoke() {
  return vi.fn(async (command, args?: unknown) => {
    const payload = args as { activeNodeId?: string | null; nodeId?: string; nodeOrder?: string[]; nodes?: Array<{ nodeId: string }> };
    if (command === 'create_folder' || command === 'create_topic') {
      return {
        activeNodeId: payload.activeNodeId ?? payload.nodeId,
        createdNodeIds: [payload.nodeId],
        nodeOrder: payload.nodeOrder ?? [payload.nodeId],
        nodes: [payload]
      };
    }
    if (command === 'move_nodes') {
      return { movedNodeIds: payload.nodes?.map((node) => node.nodeId) ?? [], nodeOrder: payload.nodeOrder };
    }
    return null;
  });
}

beforeEach(() => {
  localStorage.clear();
  resetWorkspaceMutationRepository();
  vi.mocked(getRuntimeInvoke).mockReturnValue(createRuntimeInvoke());
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date('2026-02-25T00:00:00.000Z')));
});

async function createFolderContext() {
  const folderAId = (await useWorkspaceStore.getState().createRootNode('A', 'folder'))!;
  const folderBId = (await useWorkspaceStore.getState().createRootNode('B', 'folder'))!;
  return { folderAId, folderBId };
}

it('follows an active Topic to its destination folder', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const topicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Topic A'))!;
  useWorkspaceStore.setState({ activeNodeId: topicId, browseRootNodeId: folderAId });

  await expect(useWorkspaceStore.getState().moveNode(topicId, folderBId)).resolves.toBe(true);

  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: topicId, browseRootNodeId: folderBId });
});

it('keeps source context when the moved Topic is not the active content', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const movedTopicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Move me'))!;
  const activeTopicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Keep me'))!;
  useWorkspaceStore.setState({ activeNodeId: activeTopicId, browseRootNodeId: folderAId });

  await expect(useWorkspaceStore.getState().moveNode(movedTopicId, folderBId)).resolves.toBe(true);

  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: activeTopicId, browseRootNodeId: folderAId });
});

it('keeps folder context while organizing its Topic list', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const topicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Topic A'))!;
  useWorkspaceStore.setState({ activeNodeId: folderAId, browseRootNodeId: folderAId });

  await expect(useWorkspaceStore.getState().moveNode(topicId, folderBId)).resolves.toBe(true);

  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: folderAId, browseRootNodeId: folderAId });
});

it('does not let a pending move overwrite a newer workspace context', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const movedTopicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Move me'))!;
  const newerTopicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Keep me'))!;
  let finishMove!: (result: { movedNodeIds: string[]; nodeOrder: string[] }) => void;
  const pendingMove = new Promise<{ movedNodeIds: string[]; nodeOrder: string[] }>((resolve) => { finishMove = resolve; });
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async (command, args?: unknown) => {
    const payload = args as { nodeOrder: string[] };
    return command === 'move_nodes'
      ? pendingMove.then((result) => ({ ...result, nodeOrder: payload.nodeOrder }))
      : null;
  }));
  useWorkspaceStore.setState({ activeNodeId: movedTopicId, browseRootNodeId: folderAId });

  const moveResult = useWorkspaceStore.getState().moveNode(movedTopicId, folderBId);
  useWorkspaceStore.setState({ activeNodeId: newerTopicId, browseRootNodeId: folderAId });
  finishMove({ movedNodeIds: [movedTopicId], nodeOrder: [] });

  await expect(moveResult).resolves.toBe(true);
  expect(useWorkspaceStore.getState().nodesById[movedTopicId]?.parentNodeId).toBe(folderBId);
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: newerTopicId, browseRootNodeId: folderAId });
});

it('keeps current context when the runtime rejects a move', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const topicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Topic A'))!;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async () => null));
  useWorkspaceStore.setState({ activeNodeId: topicId, browseRootNodeId: folderAId });

  await expect(useWorkspaceStore.getState().moveNode(topicId, folderBId)).resolves.toBe(false);

  expect(useWorkspaceStore.getState().nodesById[topicId]?.parentNodeId).toBe(folderAId);
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: topicId, browseRootNodeId: folderAId });
});

it('keeps current context when the move runtime throws', async () => {
  const { folderAId, folderBId } = await createFolderContext();
  const topicId = (await useWorkspaceStore.getState().createChildNode(folderAId, 'Topic A'))!;
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn(async () => { throw new Error('move failed'); }));
  useWorkspaceStore.setState({ activeNodeId: topicId, browseRootNodeId: folderAId });

  await expect(useWorkspaceStore.getState().moveNode(topicId, folderBId)).resolves.toBe(false);

  expect(useWorkspaceStore.getState().nodesById[topicId]?.parentNodeId).toBe(folderAId);
  expect(useWorkspaceStore.getState()).toMatchObject({ activeNodeId: topicId, browseRootNodeId: folderAId });
});
