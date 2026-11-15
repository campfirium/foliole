import { beforeEach, expect, it, vi } from 'vitest';

import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import { createAssistantPanelNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import { sendAssistantTurn } from './workspaceRightSidebarAssistantSend';

vi.mock('../../shared/platform/assistantRuntime', () => ({ sendAssistantMessage: vi.fn() }));

beforeEach(() => vi.mocked(sendAssistantMessage).mockReset());

it('omits the current material when it is unrelated to the conversation', async () => {
  const node = createAssistantPanelNode({ id: 'node-1', title: 'Current material' });
  await sendAssistantTurn({
    activeNodeId: node.id,
    editorAdapterRef: undefined,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    provider: 'codex-app-server',
    openingLocation: { type: 'workspace' },
    selectedThreadId: null
  }, 'turn-1', 'Question');

  const payload = vi.mocked(sendAssistantMessage).mock.calls[0]?.[0];
  expect(payload).toMatchObject({
    clientTurnId: 'turn-1',
    message: 'Question',
    openingLocation: { type: 'workspace' },
    workspaceContext: { schemaVersion: 1, scope: 'workspace' }
  });
});

it('sends the opening material as a pointer without sending its body', async () => {
  const node = createAssistantPanelNode({
    bodyStatus: 'ready',
    content: 'Body text should be read through Agent Control instead',
    id: 'node-1',
    openingText: 'Opening preview should not be sent eagerly',
    title: 'Current material'
  });
  await sendAssistantTurn({
    activeNodeId: node.id,
    editorAdapterRef: undefined,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    provider: 'codex-app-server',
    openingLocation: { nodeId: node.id, type: 'node' },
    selectedThreadId: null
  }, 'turn-2', 'Question');

  const payload = vi.mocked(sendAssistantMessage).mock.calls[0]?.[0];
  expect(payload?.workspaceContext).toMatchObject({
    activeNodeId: 'node-1',
    activeTitle: 'Current material',
    path: ['Current material'],
    schemaVersion: 1,
    scope: 'node'
  });
  expect(payload?.workspaceContext).not.toHaveProperty('document');
  expect(payload?.workspaceContext).not.toHaveProperty('folder');
  expect(payload?.workspaceContext).not.toHaveProperty('selection');
});

it('includes selected image drafts in the native assistant payload', async () => {
  const node = createAssistantPanelNode({ id: 'node-1', title: 'Current material' });
  const image = {
    contentBase64: 'iVBORw0KGgo=',
    mimeType: 'image/png',
    originalName: 'diagram.png',
    sizeBytes: 8
  };
  await sendAssistantTurn({
    activeNodeId: node.id,
    editorAdapterRef: undefined,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    provider: 'codex-app-server',
    openingLocation: { nodeId: node.id, type: 'node' },
    selectedThreadId: null
  }, 'turn-image', 'Describe this', [image]);

  expect(sendAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({ images: [image] }));
});

it('sends the resolved model selection on every turn', async () => {
  const node = createAssistantPanelNode({ id: 'node-1', title: 'Current material' });
  const modelSelection = { effort: 'high', model: 'gpt-test', serviceTier: 'fast' };
  await sendAssistantTurn({
    activeNodeId: node.id,
    editorAdapterRef: undefined,
    location: { nodeId: node.id, type: 'node' },
    modelSelection,
    nodesById: { [node.id]: node },
    provider: 'codex-app-server',
    openingLocation: { nodeId: node.id, type: 'node' },
    selectedThreadId: 'existing-thread'
  }, 'turn-model', 'Use this model');

  expect(sendAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
    modelSelection,
    providerThreadId: 'existing-thread'
  }));
});

it('keeps both links and changes focus only when a linked material is open', async () => {
  const nodesById = Object.fromEntries(['a', 'b', 'c'].map(id => [
    id, createAssistantPanelNode({ id, title: id.toUpperCase() })
  ]));
  for (const id of ['a', 'b', 'c']) {
    await sendAssistantTurn({
      activeNodeId: id, editorAdapterRef: undefined, nodesById,
      location: { type: 'node', nodeId: id },
      openingLocation: { type: 'node', nodeId: 'a' },
      savedMaterialIds: ['b'], provider: 'codex-app-server', selectedThreadId: 'existing'
    }, id, 'Compare the linked materials');
  }
  const contexts = vi.mocked(sendAssistantMessage).mock.calls.map(([payload]) => payload.workspaceContext);
  expect(contexts.map(context => context?.activeNodeId)).toEqual(['a', 'b', undefined]);
  for (const context of contexts) {
    expect(context?.conversationMaterials).toEqual([{ nodeId: 'a', title: 'A' }, { nodeId: 'b', title: 'B' }]);
  }
  expect(contexts[2]).toEqual({ schemaVersion: 1, scope: 'workspace', conversationMaterials: contexts[0]?.conversationMaterials });
});
