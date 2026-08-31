import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import { createAssistantPanelNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

const assistantRuntime = vi.hoisted(() => ({
  listAssistantThreadIndex: vi.fn(),
  listAssistantThreadMessages: vi.fn(),
  loadAssistantByokSettings: vi.fn(),
  loadAssistantStatus: vi.fn(),
  removeAssistantThreadFromHistory: vi.fn(),
  selectAssistantProvider: vi.fn(),
  sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
  assistantRuntime.loadAssistantStatus.mockResolvedValue({
    capabilities: [
      { enabled: false, name: 'sendMessage' },
      { enabled: true, name: 'status' },
      { enabled: false, name: 'threadIndex' }
    ],
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });
  assistantRuntime.loadAssistantByokSettings.mockResolvedValue({
    endpoint: 'http://127.0.0.1:43121/v1/chat/completions',
    has_api_key: true,
    model: 'local-model',
    selected_provider: 'openai-compatible',
    state: 'configured'
  });
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('uses configured BYOK without Codex login, tools, or model controls', async () => {
  assistantRuntime.sendAssistantMessage.mockResolvedValue({
    message: { text: 'Local answer', threadId: 'local-thread', turnId: 'turn-1' },
    provider: 'openai-compatible',
    state: 'ready',
    threadIndex: {
      agentToolVersion: 0,
      archivedAt: null,
      continuedFromThreadId: null,
      createdAt: '2026-08-31T00:00:00.000Z',
      deletedAt: null,
      lastOpenedAt: '2026-08-31T00:00:00.000Z',
      location: { nodeId: 'node-1', type: 'node' },
      preview: 'Ask locally',
      provider: 'openai-compatible',
      providerThreadId: 'local-thread',
      readError: null,
      readState: 'not_requested',
      status: 'active',
      title: 'Ask locally',
      updatedAt: '2026-08-31T00:00:00.000Z'
    }
  });
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createAssistantPanelNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );

  expect(await screen.findByRole('combobox', { name: 'New conversation provider' }))
    .toHaveValue('openai-compatible');
  expect(screen.queryByLabelText('Model and performance settings')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Ask locally' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Ask locally',
      provider: 'openai-compatible'
    })
  ));
  expect(await screen.findByText('Local answer')).toBeVisible();
});
