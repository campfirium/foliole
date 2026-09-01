import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
  createAssistantPanelThread as createThread
} from './WorkspaceRightSidebarAssistantPanel.testUtils';

const assistantRuntime = vi.hoisted(() => ({
  listAssistantThreadIndex: vi.fn(),
  listAssistantThreadMessages: vi.fn(),
  loadAssistantByokSettings: vi.fn(),
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
  assistantRuntime.loadAssistantByokSettings.mockResolvedValue({
    endpoint: '', has_api_key: false, model: '',
    selected_provider: 'codex-app-server', state: 'not_configured'
  });
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('checks the selected model and shows the composer when it is ready', async () => {
  renderPanel();

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
  expect(screen.queryByLabelText('New conversation provider')).not.toBeInTheDocument();
});

it('fails closed when the selected custom model has not passed the current tool contract', async () => {
  assistantRuntime.loadAssistantByokSettings.mockResolvedValueOnce({
    endpoint: 'https://models.example/chat', has_api_key: true, model: 'legacy-model',
    selected_provider: 'openai-compatible', state: 'not_configured'
  });

  renderPanel();

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('opens model settings from the unconfigured entry', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    capabilities: [], failure: { category: 'not_configured' },
    provider: 'codex-app-server', state: 'unavailable'
  });
  const onOpenModelSettings = vi.fn();
  renderPanel(onOpenModelSettings);

  expect(await screen.findByText('Aide')).toBeInTheDocument();
  expect(screen.getByText('Use ChatGPT or other AI services directly in Foliole.')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  expect(onOpenModelSettings).toHaveBeenCalledTimes(1);
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

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByText('Foliole Aide is not available in this build.')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('opens model settings when the selected model check fails', async () => {
  assistantRuntime.loadAssistantStatus.mockRejectedValueOnce(new Error('status failed'));
  const onOpenModelSettings = vi.fn();

  renderPanel(onOpenModelSettings);

  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  expect(onOpenModelSettings).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Aide is unavailable right now. Check Models settings.')).not.toBeInTheDocument();
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

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByText('Foliole Aide cannot send messages right now.')).not.toBeInTheDocument();
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

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByText(/Check result:/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('opens model settings when Foliole tools are unavailable', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('stopped'),
    capabilities: createCapabilities({ agentControl: false, sendMessage: false }),
    failure: { category: 'agent_control_unavailable' },
    provider: 'codex-app-server',
    state: 'unavailable'
  });
  const onOpenModelSettings = vi.fn();

  renderPanel(onOpenModelSettings);
  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  expect(onOpenModelSettings).toHaveBeenCalledTimes(1);
  expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1);
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('requires running Foliole tools even when Codex reports message sending ready', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: createAgentControl('stopped'),
    capabilities: createCapabilities({ agentControl: false, sendMessage: true }),
    provider: 'codex-app-server',
    state: 'ready'
  });

  renderPanel();

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('routes Codex sign-in back to model settings', async () => {
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

  expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
  expect(screen.queryByText("Sign in on OpenAI's website.")).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign in with OpenAI' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Check result:/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
});

it('checks the selected model after reload', async () => {
  renderPanel();

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
});

it('shows an unavailable location for history threads whose topic cannot be restored', async () => {
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

function renderPanel(onOpenModelSettings = vi.fn()) {
  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onOpenModelSettings={onOpenModelSettings}
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
