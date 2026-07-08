import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

const assistantRuntime = vi.hoisted(() => ({
  deleteAssistantThreadIndex: vi.fn(),
  listAssistantThreadIndex: vi.fn(),
  loadAssistantStatus: vi.fn(),
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
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'threadIndex' }
    ],
    provider: 'codex-app-server',
    state: 'ready'
  });
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
});

it('restores the input when the active turn fails before the send promise resolves', async () => {
  let turnEventHandler:
    | ((event: { clientTurnId: string; kind: string; provider: string }) => void)
    | null = null;
  assistantRuntime.subscribeAssistantTurnEvents.mockImplementation((handler) => {
    turnEventHandler = handler;
    return () => undefined;
  });
  assistantRuntime.sendAssistantMessage.mockImplementationOnce((args) => {
    turnEventHandler?.({
      clientTurnId: args.clientTurnId,
      kind: 'failed',
      provider: 'codex-app-server'
    });
    return new Promise(() => undefined);
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByLabelText('Foliole Aide message');

  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Retry me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('Retry me'));
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});
