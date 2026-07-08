import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
  createAssistantPanelThread as createThread
} from './WorkspaceRightSidebarAssistantPanel.testUtils';

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
  assistantRuntime.deleteAssistantThreadIndex.mockResolvedValue(null);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('removes a history thread from the local list', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ providerThreadId: 'thread-1', title: 'First prompt' }),
    createThread({ providerThreadId: 'thread-2', title: 'Second prompt' })
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('button', { name: /first prompt/i });

  const removeButtons = screen.getAllByRole('button', { name: 'Remove thread from this list' });
  expect(removeButtons).not.toHaveLength(0);
  const firstRemoveButton = removeButtons[0];
  if (!firstRemoveButton) throw new Error('Expected a remove-thread button.');
  fireEvent.click(firstRemoveButton);

  await waitFor(() =>
    expect(assistantRuntime.deleteAssistantThreadIndex).toHaveBeenCalledWith({
      providerThreadId: 'thread-1'
    })
  );
  expect(screen.queryByRole('button', { name: /first prompt/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /second prompt/i })).toBeInTheDocument();
});
