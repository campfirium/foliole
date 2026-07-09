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

it('shows the last MCP tool error from the Agent Control trace', async () => {
  assistantRuntime.loadAssistantStatus.mockResolvedValueOnce({
    agentControl: {
      capabilities: ['materials.read'],
      descriptorEnvVar: 'FOLIOLE_AGENT_DESCRIPTOR',
      descriptorPath: 'C:\\Foliole\\cache\\agent-control-session.json',
      state: 'running',
      trace: {
        count: 1,
        lastError: 'connection_failed',
        lastStatus: 'error',
        lastTimestamp: '2026-07-09T01:00:00.000Z',
        lastTool: 'foliole_materials_read'
      }
    },
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

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Last tool: foliole_materials_read.')).toBeInTheDocument();
  expect(screen.getByText('Tool detail: connection_failed.')).toBeInTheDocument();
});
