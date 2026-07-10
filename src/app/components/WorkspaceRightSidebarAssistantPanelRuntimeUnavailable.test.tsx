import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
  createAssistantPanelThread as createThread,
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
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.removeAssistantThreadFromHistory.mockResolvedValue(createThread({}));
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('shows a history load error when the native history runtime is unavailable', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce(null);

  renderPanel();

  expect(await screen.findByText('Foliole Aide could not load local history. Try again later.')).toBeInTheDocument();
  expect(screen.queryByText('No local Foliole Aide history yet.')).not.toBeInTheDocument();
});

it('keeps a history thread visible when native removal returns no record', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ providerThreadId: 'thread-1', title: 'First prompt' })
  ]);
  assistantRuntime.removeAssistantThreadFromHistory.mockResolvedValueOnce(null);

  renderPanel();
  await screen.findByRole('button', { name: /first prompt/i });

  fireEvent.click(screen.getByRole('button', { name: 'Remove from local Foliole Aide history' }));

  expect(await screen.findByText('Foliole Aide could not remove that thread from local history.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /first prompt/i })).toBeInTheDocument();
});

it('keeps the local history preview when native message loading returns no records', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      preview: 'Saved prompt preview',
      providerThreadId: 'thread-1',
      title: 'Saved thread'
    })
  ]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValueOnce(null);

  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: /saved thread/i }));

  expect(await screen.findByText('Foliole Aide could not load saved local messages. Showing the local preview.')).toBeInTheDocument();
  expect(await screen.findByText('Local history preview: Saved prompt preview')).toBeInTheDocument();
});

function renderPanel() {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
}
