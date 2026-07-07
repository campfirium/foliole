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
  loadAssistantStatus: vi.fn(),
  sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => assistantRuntime);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
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
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('does not probe Codex or show the composer before Foliole Aide is enabled', () => {
  renderPanel();

  expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.loadAssistantStatus).not.toHaveBeenCalled();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
  expect(assistantRuntime.sendAssistantMessage).not.toHaveBeenCalled();
});

it('checks Codex only after the user enables Foliole Aide', async () => {
  renderPanel();

  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

  await waitFor(() => expect(assistantRuntime.loadAssistantStatus).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('Foliole Aide message')).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledWith({
    location: { nodeId: 'node-1', type: 'node' }
  });
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
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

  expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});

it('does not auto-check Codex after reload when Foliole Aide was enabled earlier', () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');

  renderPanel();

  expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.loadAssistantStatus).not.toHaveBeenCalled();
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
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
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
