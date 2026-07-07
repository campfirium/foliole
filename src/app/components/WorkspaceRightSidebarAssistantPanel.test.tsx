import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeAssistantThreadIndexRecord } from '../../../lib/platform/nativeAssistantContract';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';

const assistantRuntime = vi.hoisted(() => ({
  listAssistantThreadIndex: vi.fn(),
  sendAssistantMessage: vi.fn(),
  subscribeAssistantTurnEvents: vi.fn()
}));

vi.mock('../../shared/platform/assistantRuntime', () => assistantRuntime);

function createNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? 'node-1',
    parentNodeId: overrides.parentNodeId ?? null,
    kind: overrides.kind ?? 'topic',
    title: overrides.title ?? 'Topic',
    content: overrides.content ?? '',
    anchorLink: overrides.anchorLink ?? null,
    reveal: overrides.reveal ?? null,
    review: overrides.review ?? null,
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z'
  };
}

function createThread(
  overrides: Partial<NativeAssistantThreadIndexRecord>
): NativeAssistantThreadIndexRecord {
  return {
    archivedAt: null,
    createdAt: '2026-07-07T00:00:00.000Z',
    deletedAt: null,
    lastOpenedAt: '2026-07-07T00:00:00.000Z',
    location: { nodeId: 'node-1', type: 'node' },
    preview: 'Original prompt',
    provider: 'codex-app-server',
    providerThreadId: 'thread-1',
    readError: null,
    readState: 'not_requested',
    status: 'active',
    title: 'Original prompt',
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('loads Assistant threads for the active topic location', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([createThread({})]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );

  expect(await screen.findByRole('button', { name: /original prompt/i })).toBeInTheDocument();
  expect(assistantRuntime.listAssistantThreadIndex).toHaveBeenCalledWith({
    location: { nodeId: 'node-1', type: 'node' }
  });
  expect(screen.getByText('Messages from this app session will appear here.')).toBeInTheDocument();
});

it('creates a new thread and moves pending messages into the returned thread cache', async () => {
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
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );

  fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'New prompt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'New prompt',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    })
  );
  expect(await screen.findByText('Assistant answer')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /new prompt/i })).toBeInTheDocument();
});

it('continues a selected thread and switches to its saved node location', async () => {
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
  fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'Follow-up' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'Follow-up',
      openingLocation: { nodeId: 'node-2', type: 'node' },
      providerThreadId: 'thread-1'
    })
  );
  expect(await screen.findByText('Follow-up answer')).toBeInTheDocument();
});

it('starts a new thread after clearing the selected history thread', async () => {
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
  fireEvent.change(screen.getByLabelText('Assistant message'), {
    target: { value: 'Fresh prompt' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledWith({
      clientTurnId: expect.any(String),
      message: 'Fresh prompt',
      openingLocation: { nodeId: 'node-1', type: 'node' }
    })
  );
  expect(await screen.findByText('Fresh answer')).toBeInTheDocument();
});

it('updates the pending assistant bubble from turn delta events', async () => {
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

  fireEvent.change(screen.getByLabelText('Assistant message'), { target: { value: 'New prompt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Partial answer')).toBeInTheDocument();
  expect(await screen.findByText('Final answer')).toBeInTheDocument();
});
