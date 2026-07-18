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
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
});

it('keeps a continued thread title stable while updating the history preview', async () => {
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      preview: 'Original preview',
      providerThreadId: 'thread-1',
      title: 'Original prompt'
    })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({
      preview: 'Follow-up prompt',
      providerThreadId: 'thread-1',
      title: 'Original prompt'
    })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /original prompt/i }));
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Follow-up prompt' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);
  await screen.findByText('Follow-up answer');

  fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));

  expect(screen.getByText('This topic: Topic · Follow-up prompt')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /original prompt/i })).toBeInTheDocument();
});

it('explains inside the new conversation when Agent tools required a continuation', async () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({
      continuedFromThreadId: 'thread-old',
      providerThreadId: 'thread-new',
      title: 'Continued task'
    })
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /continued task/i }));

  expect(await screen.findByText('为完成任务，已新建此对话并启用新增的 Agent 工具。')).toBeInTheDocument();
});

it('leaves a localized continuation record in the old conversation and opens its destination', async () => {
  window.localStorage.setItem('foliole-app-language', 'zh-Hans');
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ providerThreadId: 'thread-old', title: '旧对话' }),
    createThread({
      continuedFromThreadId: 'thread-old',
      providerThreadId: 'thread-new',
      title: '新对话'
    })
  ]);

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /旧对话/ }));

  const destinationLink = await screen.findByRole('link', { name: '新对话' });
  expect(destinationLink.closest('[data-message-role="system"]')).toHaveTextContent(
    '完成任务需要使用新增的 Agent 工具，已转到新对话继续。'
  );
  fireEvent.click(destinationLink);

  expect(await screen.findByRole('heading', { name: '新对话' })).toBeInTheDocument();
});

it('moves the triggering user prompt into the continued conversation before the reply', async () => {
  assistantRuntime.listAssistantThreadMessages.mockResolvedValueOnce([
    {
      createdAt: '2026-07-07T00:00:01.000Z',
      id: 'turn-old:user',
      provider: 'codex-app-server',
      providerThreadId: 'thread-old',
      role: 'user',
      text: 'Earlier question'
    },
    {
      createdAt: '2026-07-07T00:00:02.000Z',
      id: 'turn-old:assistant',
      provider: 'codex-app-server',
      providerThreadId: 'thread-old',
      role: 'assistant',
      text: 'Earlier answer'
    }
  ]);
  assistantRuntime.listAssistantThreadIndex.mockResolvedValueOnce([
    createThread({ agentToolVersion: 0, providerThreadId: 'thread-old', title: 'Earlier task' })
  ]);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    message: { text: 'The memo is updated.', threadId: 'thread-new', turnId: 'turn-new' },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: createThread({
      continuedFromThreadId: 'thread-old',
      providerThreadId: 'thread-new',
      title: 'Can you write this back?'
    })
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /earlier task/i }));
  const earlierAnswer = await screen.findByText('Earlier answer');
  fireEvent.change(screen.getByLabelText('Foliole Aide message'), {
    target: { value: 'Can you write this back?' }
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);

  const prompt = await screen.findByText('Can you write this back?');
  const event = screen.getByText(
    'This conversation was created with newly added Agent tools to complete the task.'
  );
  const reply = screen.getByText('The memo is updated.');
  expect(earlierAnswer).toBeInTheDocument();
  expect(earlierAnswer.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(prompt.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(event.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
