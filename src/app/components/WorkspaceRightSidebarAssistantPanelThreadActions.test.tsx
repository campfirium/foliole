import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  await screen.findByRole('button', { name: /first prompt/i });

  const removeButtons = screen.getAllByRole('button', { name: 'Remove from local Foliole Aide history' });
  expect(removeButtons).not.toHaveLength(0);
  const firstRemoveButton = removeButtons[0];
  if (!firstRemoveButton) throw new Error('Expected a remove-thread button.');
  fireEvent.click(firstRemoveButton);

  await waitFor(() =>
    expect(assistantRuntime.removeAssistantThreadFromHistory).toHaveBeenCalledWith({
      providerThreadId: 'thread-1'
    })
  );
  expect(screen.queryByRole('button', { name: /first prompt/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /second prompt/i })).toBeInTheDocument();
});

it('shows a history load error instead of an empty history state', async () => {
  assistantRuntime.listAssistantThreadIndex.mockRejectedValueOnce(new Error('history failed'));

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  expect(await screen.findByText('Foliole Aide could not load local history. Try again later.')).toBeInTheDocument();
  expect(screen.queryByText('No local Foliole Aide history yet.')).not.toBeInTheDocument();
});

it('reloads local history from the load error state', async () => {
  assistantRuntime.listAssistantThreadIndex
    .mockRejectedValueOnce(new Error('history failed'))
    .mockResolvedValueOnce([
      createThread({ providerThreadId: 'thread-recovered', title: 'Recovered thread' })
    ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  expect(await screen.findByText('Foliole Aide could not load local history. Try again later.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByRole('button', { name: /recovered thread/i })).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledTimes(2);
});

it('keeps a history thread visible when removing it fails', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ providerThreadId: 'thread-1', title: 'First prompt' })
  ]);
  assistantRuntime.removeAssistantThreadFromHistory.mockRejectedValueOnce(new Error('remove failed'));

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  await screen.findByRole('button', { name: /first prompt/i });

  const removeButton = screen.getByRole('button', { name: 'Remove from local Foliole Aide history' });
  fireEvent.click(removeButton);

  expect(await screen.findByText('Foliole Aide could not remove that thread from local history.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /first prompt/i })).toBeInTheDocument();
});

it('shows the local history preview when a thread is selected', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      preview: 'Saved prompt preview',
      providerThreadId: 'thread-1',
      title: 'Saved thread'
    })
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /saved thread/i }));

  expect(screen.getByText('Local history preview: Saved prompt preview')).toBeInTheDocument();
  expect(screen.getByText(/Saved local messages appear here/i)).toBeInTheDocument();
});

it('shows persisted local messages when a history thread is selected', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      preview: 'Saved prompt preview',
      providerThreadId: 'thread-1',
      title: 'Saved thread'
    })
  ]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValueOnce([
    {
      createdAt: '2026-07-07T01:00:01.000Z',
      id: 'turn-1:user',
      provider: 'codex-app-server',
      providerThreadId: 'thread-1',
      role: 'user',
      text: 'Saved user prompt'
    },
    {
      createdAt: '2026-07-07T01:00:02.000Z',
      id: 'turn-1:assistant',
      provider: 'codex-app-server',
      providerThreadId: 'thread-1',
      role: 'assistant',
      text: 'Saved assistant answer'
    }
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /saved thread/i }));

  expect(await screen.findByText('Saved user prompt')).toBeInTheDocument();
  expect(screen.getByText('Saved assistant answer')).toBeInTheDocument();
});

it('keeps the local history preview when persisted messages fail to load', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      preview: 'Saved prompt preview',
      providerThreadId: 'thread-1',
      title: 'Saved thread'
    })
  ]);
  assistantRuntime.listAssistantThreadMessages.mockRejectedValueOnce(new Error('messages failed'));

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /saved thread/i }));

  expect(await screen.findByText('Foliole Aide could not load saved local messages. Showing the local preview.')).toBeInTheDocument();
  expect(await screen.findByText('Local history preview: Saved prompt preview')).toBeInTheDocument();
});

it('shows concrete topic paths for global history threads', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      location: { nodeId: 'node-2', type: 'node' },
      preview: 'Saved prompt preview',
      title: 'Saved thread'
    })
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{
        'folder-1': createNode({ id: 'folder-1', kind: 'folder', title: 'Projects' }),
        'node-1': createNode({ id: 'node-1', title: 'Current topic' }),
        'node-2': createNode({ id: 'node-2', parentNodeId: 'folder-1', title: 'Saved topic' })
      }}
      onSelectNode={vi.fn()}
    />
  );

  expect(await screen.findByText('Topic: Projects / Saved topic · Saved prompt preview')).toBeInTheDocument();
});
