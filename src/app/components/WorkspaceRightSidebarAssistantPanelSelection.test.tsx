import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
  createReadyAssistantStatus
} from './WorkspaceRightSidebarAssistantPanel.testUtils';

const assistantRuntime = vi.hoisted(() => ({
  listAssistantThreadIndex: vi.fn(),
  listAssistantThreadMessages: vi.fn(),
  loadAssistantStatus: vi.fn(),
  removeAssistantThreadFromHistory: vi.fn(),
  sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
  assistantRuntime.loadAssistantStatus.mockResolvedValue(createReadyAssistantStatus());
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.removeAssistantThreadFromHistory.mockResolvedValue(null);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('does not send current editor selection text eagerly', async () => {
  const editorAdapterRef = {
    current: {
      getContent: () => 'Alpha Beta Gamma',
      getSelectionRanges: () => [{ from: 6, to: 10 }]
    } as never
  };
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Assistant answer', threadId: 'thread-new', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready'
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      editorAdapterRef={editorAdapterRef}
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Explain this' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceContext: expect.objectContaining({
          activeNodeId: 'node-1',
          scope: 'node'
        })
      })
    )
  );
  const payload = assistantRuntime.sendAssistantMessage.mock.calls[0]?.[0];
  expect(payload.workspaceContext).not.toHaveProperty('selection');
});
