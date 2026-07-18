import type { ElectronApplication } from '@playwright/test';

export async function installAssistantContinuationIpcMock(
  electronApp: ElectronApplication,
  status: unknown
) {
  const messages = createMessages();
  const records = [
    createThread('thread-old', 'Original prompt', 'Original preview', null, '2026-07-07T00:00:00.000Z'),
    createThread('thread-new', 'Continued task', 'Continue now', 'thread-old', '2026-07-07T00:00:02.500Z')
  ];
  const followUpMessages = [
    message('turn-latest:user', 'user', 'Now?', '2026-07-07T00:00:05.000Z'),
    message('turn-latest:assistant', 'assistant', 'Latest answer', '2026-07-07T00:00:06.000Z')
  ];
  await electronApp.evaluate(({ ipcMain }, payload) => {
    let currentMessages = payload.messages;
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      if (request?.command === 'assistant_get_status') return payload.status;
      if (request?.command === 'assistant_list_thread_index') return payload.records;
      if (request?.command === 'assistant_list_thread_messages') {
        const threadId = (request.args as { providerThreadId?: string } | undefined)?.providerThreadId;
        return threadId === 'thread-new' ? currentMessages : currentMessages.slice(0, 2);
      }
      if (request?.command === 'assistant_send_message') {
        currentMessages = [...currentMessages, ...payload.followUpMessages];
        return payload.sendResult;
      }
      return null;
    });
  }, {
    followUpMessages,
    messages,
    records,
    sendResult: {
      message: { text: 'Latest answer', threadId: 'thread-new', turnId: 'turn-latest' },
      provider: 'codex-app-server',
      state: 'ready',
      threadIndex: records[1]
    },
    status
  });
}

function createThread(
  providerThreadId: string,
  title: string,
  preview: string,
  continuedFromThreadId: string | null,
  createdAt: string
) {
  return {
    agentToolVersion: 1,
    archivedAt: null,
    continuedFromThreadId,
    createdAt,
    deletedAt: null,
    lastOpenedAt: '2026-07-07T00:00:00.000Z',
    location: { type: 'workspace' },
    preview,
    provider: 'codex-app-server',
    providerThreadId,
    readError: null,
    readState: 'not_requested',
    status: 'active',
    title,
    updatedAt: '2026-07-07T00:00:00.000Z'
  };
}

function createMessages() {
  return [
    message('turn-old:user', 'user', 'Earlier question', '2026-07-07T00:00:01.000Z'),
    message('turn-old:assistant', 'assistant', 'Earlier answer', '2026-07-07T00:00:02.000Z'),
    message('turn-new:user', 'user', 'Continue now', '2026-07-07T00:00:03.000Z'),
    message('turn-new:assistant', 'assistant', 'Continued answer', '2026-07-07T00:00:04.000Z')
  ];
}

function message(id: string, role: 'assistant' | 'user', text: string, createdAt: string) {
  return {
    createdAt,
    id,
    provider: 'codex-app-server',
    providerThreadId: 'thread-new',
    role,
    text
  };
}
