import type { ElectronApplication } from '@playwright/test';

export async function installAssistantContinuationIpcMock(
  electronApp: ElectronApplication,
  status: unknown
) {
  const messages = createMessages();
  const records = [
    createThread('thread-old', 'Original prompt', 'Original preview', null),
    createThread('thread-new', 'Continued task', 'Continue now', 'thread-old')
  ];
  await electronApp.evaluate(({ ipcMain }, payload) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      if (request?.command === 'assistant_get_status') return payload.status;
      if (request?.command === 'assistant_list_thread_index') return payload.records;
      if (request?.command !== 'assistant_list_thread_messages') return null;
      const threadId = (request.args as { providerThreadId?: string } | undefined)?.providerThreadId;
      return threadId === 'thread-new' ? payload.messages : payload.messages.slice(0, 2);
    });
  }, { messages, records, status });
}

function createThread(
  providerThreadId: string,
  title: string,
  preview: string,
  continuedFromThreadId: string | null
) {
  return {
    agentToolVersion: 1,
    archivedAt: null,
    continuedFromThreadId,
    createdAt: '2026-07-07T00:00:00.000Z',
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
