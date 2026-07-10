import { beforeEach, expect, it, vi } from 'vitest';

import { sendAssistantMessage } from '../../shared/platform/assistantRuntime';

import { createAssistantPanelNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';
import { sendAssistantTurn } from './workspaceRightSidebarAssistantSend';

vi.mock('../../shared/platform/assistantRuntime', () => ({ sendAssistantMessage: vi.fn() }));

beforeEach(() => vi.mocked(sendAssistantMessage).mockReset());

it('omits workspace context while preserving the opening location when following is off', async () => {
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
    openingLocation: { nodeId: 'node-1', type: 'node' }
  });
  expect(payload).not.toHaveProperty('workspaceContext');
});
