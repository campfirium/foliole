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
  assistantRuntime.loadAssistantStatus.mockResolvedValue(createReadyAssistantStatus());
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.removeAssistantThreadFromHistory.mockResolvedValue(null);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

function enableFolioleAide() {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.folioleAideEnabled, 'true');
}

it('loads Assistant threads from the local global history', async () => {
  enableFolioleAide();
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([createThread({})]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{
        parent: createNode({ id: 'parent', title: 'Parent' }),
        'node-1': createNode({ id: 'node-1', parentNodeId: 'parent' }),
        sibling: createNode({ id: 'sibling', openingText: 'Sibling preview', parentNodeId: 'parent', title: 'Sibling' })
      }}
      onSelectNode={vi.fn()}
    />
  );

  expect(await screen.findByRole('button', { name: /original prompt/i })).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledWith();
  expect(screen.queryByText(/Saved local messages appear here/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /original prompt/i }));
  expect(screen.getByText(/Saved local messages appear here/i)).toBeInTheDocument();
});

it('creates a new thread and moves pending messages into the returned thread cache', async () => {
  enableFolioleAide();
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Assistant answer', threadId: 'thread-new', turnId: 'turn-1' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({
      providerThreadId: 'thread-new',
      preview: 'New prompt',
      title: 'New prompt'
    })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{
        parent: createNode({ id: 'parent', title: 'Parent' }),
        'node-1': createNode({ id: 'node-1', parentNodeId: 'parent' }),
        sibling: createNode({ id: 'sibling', openingText: 'Sibling preview', parentNodeId: 'parent', title: 'Sibling' })
      }}
      onSelectNode={vi.fn()}
    />
  );
  await screen.findByLabelText('Foliole Aide message');

  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'New prompt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'New prompt',
      openingLocation: { nodeId: 'node-1', type: 'node' },
      workspaceContext: expect.objectContaining({
        activeNodeId: 'node-1',
        parentFolder: expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ isActive: true, nodeId: 'node-1' }),
            expect.objectContaining({ nodeId: 'sibling', preview: 'Sibling preview' })
          ])
        }),
        path: ['Parent', 'Topic'],
        scope: 'node'
      })
    })
  );
  expect(await screen.findByText('Assistant answer')).toBeInTheDocument();
  expect(screen.getAllByText('New prompt')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));
  expect(screen.getByRole('button', { name: /new prompt/i })).toBeInTheDocument();
});
it('continues a selected thread and switches to its saved node location', async () => {
  enableFolioleAide();
  const onSelectNode = vi.fn();
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ location: { nodeId: 'node-2', type: 'node' } })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({ preview: 'Follow-up', title: 'Follow-up' })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-2"
      nodesById={{ 'node-2': createNode({ id: 'node-2' }) }}
      onSelectNode={onSelectNode}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));
  expect(onSelectNode).toHaveBeenCalledWith('node-2');
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Follow-up' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'Follow-up',
      openingLocation: { nodeId: 'node-2', type: 'node' },
      providerThreadId: 'thread-1',
      workspaceContext: expect.objectContaining({
        activeNodeId: 'node-2',
        activeTitle: 'Topic',
        path: ['Topic'],
        scope: 'node'
      })
    })
  );
  expect(await screen.findByText('Follow-up answer')).toBeInTheDocument();
});
it('starts a new thread after clearing the selected history thread', async () => {
  enableFolioleAide();
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([createThread({})]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Fresh answer', threadId: 'thread-new', turnId: 'turn-3' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({ providerThreadId: 'thread-new', title: 'Fresh prompt' })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: 'New' }));
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), {
    target: { value: 'Fresh prompt' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'Fresh prompt',
      openingLocation: { nodeId: 'node-1', type: 'node' },
      workspaceContext: expect.objectContaining({
        activeNodeId: 'node-1',
        activeKind: 'topic',
        activeTitle: 'Topic',
        path: ['Topic'],
        schemaVersion: 1,
        scope: 'node'
      })
    })
  );
  expect(await screen.findByText('Fresh answer')).toBeInTheDocument();
});

it('updates the pending assistant bubble from turn delta events', async () => {
  enableFolioleAide();
  let turnEventHandler:
    | ((event: { clientTurnId: string; kind: string; provider: string; text?: string }) => void)
    | null = null;
  assistantRuntime.subscribeAssistantTurnEvents.mockImplementation((handler) => {
    turnEventHandler = handler;
    return () => undefined;
  });
  assistantRuntime.sendAssistantMessage.mockImplementationOnce(async (args) => {
    turnEventHandler?.({
      clientTurnId: args.clientTurnId,
      kind: 'delta',
      provider: 'codex-app-server',
      text: 'Partial answer'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      message: { text: 'Final answer', threadId: 'thread-new', turnId: 'turn-1' },
      provider: 'codex-app-server',
      state: 'ready',
      threadIndex: createThread({ providerThreadId: 'thread-new' })
    };
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  await screen.findByLabelText('Foliole Aide message');

  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'New prompt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Partial answer')).toBeInTheDocument();
  expect(await screen.findByText('Final answer')).toBeInTheDocument();
});
