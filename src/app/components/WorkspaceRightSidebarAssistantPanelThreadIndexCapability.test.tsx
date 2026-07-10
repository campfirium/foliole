import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import { createAssistantPanelNode as createNode } from './WorkspaceRightSidebarAssistantPanel.testUtils';

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
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('requires local history capability before showing the composer', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: {
      capabilities: ['materials.read'],
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      state: 'running',
      trace: { count: 0 }
    },
    capabilities: [
      { enabled: true, name: 'status' },
      { enabled: true, name: 'sendMessage' },
      { enabled: true, name: 'agentControl' },
      { enabled: false, name: 'threadIndex' }
    ],
    provider: 'codex-app-server',
    state: 'ready'
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Foliole Aide cannot load local history right now.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).not.toHaveBeenCalled();
});
