import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { WorkspaceRightSidebarAssistantPanel } from './WorkspaceRightSidebarAssistantPanel';
import {
  createAssistantPanelNode as createNode,
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
  assistantRuntime.listAssistantThreadIndex.mockResolvedValue([]);
  assistantRuntime.listAssistantThreadMessages.mockResolvedValue([]);
  assistantRuntime.removeAssistantThreadFromHistory.mockResolvedValue(null);
});

it('restores the input when the active turn fails before the send promise resolves', async () => {
  let turnEventHandler:
    | ((event: { clientTurnId: string; kind: string; provider: string }) => void)
    | null = null;
  assistantRuntime.subscribeAssistantTurnEvents.mockImplementation((handler) => {
    turnEventHandler = handler;
    return () => undefined;
  });
  assistantRuntime.sendAssistantMessage.mockImplementationOnce((args) => {
    turnEventHandler?.({
      clientTurnId: args.clientTurnId,
      kind: 'failed',
      provider: 'codex-app-server'
    });
    return new Promise(() => undefined);
  });

  renderWithLocalization(
    <WorkspaceRightSidebarAssistantPanel
      activeNodeId="node-1"
      nodesById={{ 'node-1': createNode({ id: 'node-1' }) }}
      onSelectNode={vi.fn()}
    />
  );
  await screen.findByLabelText('Foliole Aide message');

  fireEvent.change(screen.getByLabelText('Foliole Aide message'), { target: { value: 'Retry me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('Retry me'));
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});

it('keeps a newer turn active after an older failed turn promise settles', async () => {
  const firstTurn = createDeferred<unknown>();
  const turnEventHandler: {
    current: ((event: { clientTurnId: string; kind: string; provider: string; text?: string }) => void) | null;
  } = { current: null };
  assistantRuntime.subscribeAssistantTurnEvents.mockImplementation((handler) => {
    turnEventHandler.current = handler;
    return () => undefined;
  });
  assistantRuntime.sendAssistantMessage
    .mockImplementationOnce((args) => {
      turnEventHandler.current?.({
        clientTurnId: args.clientTurnId,
        kind: 'failed',
        provider: 'codex-app-server'
      });
      return firstTurn.promise;
    })
    .mockImplementationOnce(() => new Promise(() => undefined));

  renderPanel();
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'First turn' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('First turn'));

  fireEvent.change(screen.getByLabelText('Foliole Aide message'), {
    target: { value: 'Second turn' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(assistantRuntime.sendAssistantMessage).toHaveBeenCalledTimes(2));

  await act(async () => {
    firstTurn.resolve({ provider: 'codex-app-server', state: 'failed' });
  });
  const handler = turnEventHandler.current;
  const secondTurnArgs = assistantRuntime.sendAssistantMessage.mock.calls[1]?.[0];
  if (!handler || !secondTurnArgs) throw new Error('Expected a second active turn.');
  handler({
    clientTurnId: secondTurnArgs.clientTurnId,
    kind: 'delta',
    provider: 'codex-app-server',
    text: 'Second partial'
  });

  expect(await screen.findByText('Second partial')).toBeInTheDocument();
});

it('restores the input when the send call rejects before a provider result', async () => {
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
  assistantRuntime.sendAssistantMessage.mockRejectedValueOnce(new Error('send failed'));

  renderPanel();
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Retry me' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Foliole Aide could not reply. Check the message and send again.')).toBeInTheDocument();
  expect(screen.getByLabelText('Foliole Aide message')).toHaveValue('Retry me');
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});

it('returns to the capability gate when a send result reports an auth failure', async () => {
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    failure: { category: 'auth_failed' },
    provider: 'codex-app-server',
    state: 'failed'
  });

  renderPanel();
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Retry me' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Open Codex and sign in, then retry Foliole Aide.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
});

it('returns to the capability gate when the Codex connection is interrupted', async () => {
  assistantRuntime.subscribeAssistantTurnEvents.mockReturnValue(() => undefined);
  assistantRuntime.sendAssistantMessage.mockResolvedValueOnce({
    failure: { category: 'interrupted' },
    provider: 'codex-app-server',
    state: 'failed'
  });

  renderPanel();
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Retry me' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Foliole Aide connection ended before the reply. Retry to reconnect.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
});

it('returns to the capability gate when a turn event reports missing Foliole tools', async () => {
  let turnEventHandler:
    | ((event: { clientTurnId: string; failure: { category: 'agent_control_unavailable' }; kind: string; provider: string }) => void)
    | null = null;
  assistantRuntime.subscribeAssistantTurnEvents.mockImplementation((handler) => {
    turnEventHandler = handler;
    return () => undefined;
  });
  assistantRuntime.sendAssistantMessage.mockImplementationOnce((args) => {
    turnEventHandler?.({
      clientTurnId: args.clientTurnId,
      failure: { category: 'agent_control_unavailable' },
      kind: 'failed',
      provider: 'codex-app-server'
    });
    return new Promise(() => undefined);
  });

  renderPanel();
  fireEvent.change(await screen.findByLabelText('Foliole Aide message'), {
    target: { value: 'Retry me' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Foliole Aide is connected to Codex, but Foliole tools are not ready yet.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Foliole Aide message')).not.toBeInTheDocument();
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}
