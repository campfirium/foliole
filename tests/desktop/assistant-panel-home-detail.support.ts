import type { ElectronApplication, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const assistantReadyStatus = {
  agentControl: { capabilities: ['materials.read'], state: 'running' },
  capabilities: [
    { enabled: true, name: 'status' },
    { enabled: true, name: 'sendMessage' },
    { enabled: true, name: 'agentControl' },
    { enabled: true, name: 'threadIndex' }
  ],
  provider: 'codex-app-server',
  state: 'ready'
};

const savedThreadMessages = [
  {
    createdAt: '2026-07-07T00:00:01.000Z',
    id: 'turn-1:user',
    provider: 'codex-app-server',
    providerThreadId: 'thread-1',
    role: 'user',
    text: 'Saved user prompt'
  },
  {
    createdAt: '2026-07-07T00:00:02.000Z',
    id: 'turn-1:assistant',
    provider: 'codex-app-server',
    providerThreadId: 'thread-1',
    role: 'assistant',
    text: 'Saved assistant answer'
  }
];

export async function openAssistantPanel(desktopWindow: Page) {
  const activeSurface = desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]');
  const directButton = desktopWindow.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  const moreButton = desktopWindow.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ });
  await expect.poll(async () =>
    await activeSurface.isVisible()
      || await directButton.first().isVisible()
      || await moreButton.isVisible()
  ).toBe(true);
  if (await activeSurface.isVisible()) return;
  if (await directButton.first().isVisible()) {
    await directButton.first().click();
    return;
  }
  await moreButton.click();
  await desktopWindow.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

export async function installAssistantIpcMock(
  electronApp: ElectronApplication,
  options: { historyFailureOnce?: boolean; sendFailure?: 'auth_failed' | 'launch_failed'; status?: unknown } = {}
) {
  await electronApp.evaluate(({ ipcMain }, fixture) => {
    globalThis.__folioleAssistantInvokeRequests = [];
    let historyFailed = false;
    const createThread = (providerThreadId: string, title: string) => ({
      archivedAt: null,
      createdAt: '2026-07-07T00:00:00.000Z',
      deletedAt: null,
      lastOpenedAt: '2026-07-07T00:00:00.000Z',
      location: { type: 'workspace' },
      preview: title,
      provider: 'codex-app-server',
      providerThreadId,
      readError: null,
      readState: 'not_requested',
      status: 'active',
      title,
      updatedAt: '2026-07-07T00:00:00.000Z'
    });
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      const command = request?.command;
      globalThis.__folioleAssistantInvokeRequests.push(request);
      if (command === 'assistant_get_status') return fixture.status;
      if (command === 'desktop_update_check') return { phase: 'not-applicable' };
      if (command === 'assistant_list_thread_index') {
        if (fixture.options.historyFailureOnce && !historyFailed) {
          historyFailed = true;
          throw new Error('history failed');
        }
        return [createThread('thread-1', 'Original prompt')];
      }
      if (command === 'assistant_list_thread_messages') return fixture.messages;
      if (command === 'assistant_send_message') {
        if (fixture.options.sendFailure) {
          return {
            failure: { category: fixture.options.sendFailure },
            provider: 'codex-app-server',
            state: 'failed'
          };
        }
        return {
          message: { text: 'Assistant answer', threadId: 'thread-new', turnId: 'turn-1' },
          provider: 'codex-app-server',
          state: 'ready',
          threadIndex: createThread('thread-new', 'New prompt')
        };
      }
      return null;
    });
  }, { messages: savedThreadMessages, options, status: options.status ?? assistantReadyStatus });
}

export async function expectAssistantSendPayload(electronApp: ElectronApplication) {
  const requests = await electronApp.evaluate(() => globalThis.__folioleAssistantInvokeRequests);
  const sendRequests = requests.filter((request) => request.command === 'assistant_send_message');
  expect(sendRequests).toHaveLength(1);
  expect(sendRequests[0]).toEqual(expect.objectContaining({
    args: expect.objectContaining({
      message: 'New prompt',
      openingLocation: expect.objectContaining({ type: expect.any(String) }),
      workspaceContext: expect.objectContaining({
        schemaVersion: 1,
        scope: expect.any(String)
      })
    }),
    command: 'assistant_send_message'
  }));
}

declare global {
  var __folioleAssistantInvokeRequests: Array<{ args?: unknown; command?: string }>;
}
