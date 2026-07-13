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
  assistantRuntime.loadAssistantStatus.mockResolvedValue({
    agentControl: createAgentControl('running'),
    capabilities: createCapabilities({ agentControl: true, sendMessage: true }),
    provider: 'codex-app-server',
    state: 'ready'
  });
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('does not probe Codex or show the composer before the user connects', () => {
  renderPanel();

  expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.loadAssistantStatus).not.toHaveBeenCalled();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
  expect(assistantRuntime.sendAssistantMessage).not.toHaveBeenCalled();
});

it('checks Codex only after the user connects Foliole Aide', async () => {
  renderPanel();

  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledWith();
});

it('keeps the composer hidden when the Codex check is unavailable', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: false, name: 'sendMessage' },
      { enabled: false, name: 'threadIndex' }
    ],
    failure: { category: 'not_configured' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.getByText('Foliole Aide is not available in this build.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('shows Retry when the Codex check fails before returning a status', async () => {
  assistantRuntime.loadAssistantStatus.mockRejectedValueOnce(new Error('status failed'));

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.getByText('Foliole Aide is unavailable right now. Try again.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('requires the sendMessage capability before showing the composer', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('running'),
    capabilities: createCapabilities({ agentControl: true, sendMessage: false }),
    provider: 'codex-app-server',
    state: 'ready'
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.getByText('Foliole Aide cannot send messages right now.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('keeps the composer hidden when Foliole tools are not ready', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('failed', 'listen EADDRINUSE 127.0.0.1:5000'),
    capabilities: createCapabilities({ agentControl: false, sendMessage: false }),
    failure: { category: 'agent_control_unavailable' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Foliole Aide is connected, but Foliole tools are not ready yet.')).toBeInTheDocument();
  expect(screen.getByText('Check result: Codex is unavailable; Foliole tools failed.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('reloads local history after Retry recovers Foliole Aide', async () => {
  assistantRuntime.loadAssistantStatus
    .mockResolvedValueOnce({
      agentControl: createAgentControl('stopped'),
      capabilities: createCapabilities({ agentControl: false, sendMessage: false }),
      failure: { category: 'agent_control_unavailable' },
      provider: 'codex-app-server',
      state: 'unavailable'
    })
    .mockResolvedValueOnce({
      agentControl: createAgentControl('running'),
      capabilities: createCapabilities({ agentControl: true, sendMessage: true }),
      provider: 'codex-app-server',
      state: 'ready'
    });
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ providerThreadId: 'thread-recovered', title: 'Recovered prompt' })
  ]);

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Foliole Aide is connected, but Foliole tools are not ready yet.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(2));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /recovered prompt/i })).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledTimes(1);
});

it('requires running Foliole tools even when Codex reports message sending ready', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('stopped'),
    capabilities: createCapabilities({ agentControl: false, sendMessage: true }),
    provider: 'codex-app-server',
    state: 'ready'
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Foliole Aide is connected, but Foliole tools are not ready yet.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('shows an auth-specific unavailable reason when Codex rejects the session', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('running'),
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: false, name: 'sendMessage' },
      { enabled: true, name: 'agentControl' },
      { enabled: true, name: 'threadIndex' }
    ],
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });

  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Sign in with OpenAI in your browser to use Foliole Aide.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in with OpenAI' })).toBeInTheDocument();
  expect(screen.getByText('Check result: Codex needs sign-in; Foliole tools running.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
});

it('auto-checks Codex after reload when Foliole Aide stays enabled', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');

  renderPanel();

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
});

it('shows an unavailable location for history threads whose topic cannot be restored', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ location: { nodeId: 'missing-topic', type: 'node' } })
  ]);
  const onSelectNode = vi.fn();

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={onSelectNode}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));

  expect(screen.getAllByText('Topic not available in this workspace')).not.toHaveLength(0);
  expect(onSelectNode).not.toHaveBeenCalled();
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

function createAgentControl(state: 'failed' | 'running' | 'stopped', lastError?: string) {
  return {
    capabilities: ['materials.read'],
    ...(lastError ? { lastError } : {}),
    state
  };
}

function createCapabilities(flags: { agentControl: boolean; sendMessage: boolean }) {
  return [
    { enabled: true, name: 'status' },
    { enabled: flags.sendMessage, name: 'sendMessage' },
    { enabled: flags.agentControl, name: 'agentControl' },
    { enabled: true, name: 'threadIndex' }
  ];
}
