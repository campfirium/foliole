import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const readyStatus = {
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

test('Aide keeps thread location separate from the visible main panel context', async ({
  desktopApp,
  desktopWindow
}) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Follow-up');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  const requests = await desktopApp.evaluate(() => globalThis.__folioleAssistantInvokeRequests);
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({
      args: expect.objectContaining({
        openingLocation: { nodeId: 'missing-topic', type: 'node' },
        providerThreadId: 'thread-1',
        workspaceContext: expect.objectContaining({
          activeTitle: expect.any(String),
          schemaVersion: 1,
          scope: 'node'
        })
      }),
      command: 'assistant_send_message'
    })
  ]));
});

async function openAssistantPanel(desktopWindow: Page) {
  const directButton = desktopWindow.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  if (await directButton.count()) {
    await directButton.first().click();
    return;
  }
  await desktopWindow.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

async function installAssistantIpcMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }, status) => {
    globalThis.__folioleAssistantInvokeRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      globalThis.__folioleAssistantInvokeRequests.push(request);
      if (request.command === 'assistant_get_status') return status;
      if (request.command === 'assistant_list_thread_index') return [{
        archivedAt: null,
        createdAt: '2026-07-07T00:00:00.000Z',
        deletedAt: null,
        lastOpenedAt: '2026-07-07T00:00:00.000Z',
        location: { nodeId: 'missing-topic', type: 'node' },
        preview: 'Original prompt',
        provider: 'codex-app-server',
        providerThreadId: 'thread-1',
        readError: null,
        readState: 'not_requested',
        status: 'active',
        title: 'Original prompt',
        updatedAt: '2026-07-07T00:00:00.000Z'
      }];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command === 'assistant_send_message') {
        return {
          message: { text: 'Answer', threadId: 'thread-1', turnId: 'turn-2' },
          provider: 'codex-app-server',
          state: 'ready'
        };
      }
      return null;
    });
  }, readyStatus);
}

declare global {
  var __folioleAssistantInvokeRequests: Array<{ args?: unknown; command?: string }>;
}
