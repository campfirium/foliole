import { beforeEach, expect, it, vi } from 'vitest';

import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import { createAssistantPanelNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import { sendAssistantTurn } from './workspaceRightSidebarAssistantSend';

vi.mock('../../shared/platform/assistantRuntime', () => ({ sendAssistantMessage: vi.fn() }));

beforeEach(() => vi.mocked(sendAssistantMessage).mockReset());

it('keeps tool context but omits current material focus when following is off', async () => {
  const node = createAssistantPanelNode({ id: 'node-1', title: 'Current material' });
  await sendAssistantTurn({
    activeNodeId: node.id,
    editorAdapterRef: undefined,
    followCurrentMaterial: false,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    selectedRecord: null,
    selectedThreadId: null
  }, 'turn-1', 'Question');

  const payload = vi.mocked(sendAssistantMessage).mock.calls[0]?.[0];
  expect(payload).toMatchObject({
    clientTurnId: 'turn-1',
    message: 'Question',
    openingLocation: { nodeId: 'node-1', type: 'node' },
    workspaceContext: { schemaVersion: 1, scope: 'workspace' }
  });
});

it('sends only a material pointer when following is on', async () => {
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
    followCurrentMaterial: true,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    selectedRecord: null,
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
    followCurrentMaterial: false,
    location: { nodeId: node.id, type: 'node' },
    nodesById: { [node.id]: node },
    selectedRecord: null,
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
    followCurrentMaterial: false,
    location: { nodeId: node.id, type: 'node' },
    modelSelection,
    nodesById: { [node.id]: node },
    selectedRecord: null,
    selectedThreadId: 'existing-thread'
  }, 'turn-model', 'Use this model');

  expect(sendAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
    modelSelection,
    providerThreadId: 'existing-thread'
  }));
});
