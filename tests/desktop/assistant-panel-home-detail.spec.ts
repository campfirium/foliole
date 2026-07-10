import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-home-detail.png'
);
const selectedThreadNotice = /(this panel shows new messages from this app session|这个面板会显示本次应用会话的新消息)/;
const assistantReadyStatus = {
  agentControl: { state: 'running', trace: { count: 0 } },
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

test('Aide panel keeps home and conversation detail separate', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  await expect(desktopWindow.getByRole('button', { name: /Original prompt/i })).toBeVisible();
  await expect(desktopWindow.getByText(selectedThreadNotice)).toBeHidden();

  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();
  await expect(desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ })).toBeVisible();
  await expect(desktopWindow.getByText(selectedThreadNotice)).toBeHidden();
  await expect(desktopWindow.getByText('Saved user prompt')).toBeVisible();
  await expect(desktopWindow.getByText('Saved assistant answer')).toBeVisible();

  await desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('New prompt');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByText('Assistant answer')).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ })).toBeVisible();
  await expectAssistantSendPayload(desktopApp);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-home-detail', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

test('Aide panel returns to the connection gate after a provider auth failure', async ({
  desktopApp,
  desktopWindow
}) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, { sendFailure: 'auth_failed' });
  await openAssistantPanel(desktopWindow);

  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Trigger auth failure');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByText(/Open Codex and sign in|请打开 Codex 并登录/)).toBeVisible();
  await expect(desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/)).toBeHidden();
});

test('Aide panel shows the Foliole tools startup failure detail', async ({ desktopApp, desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, { status: {
    ...assistantReadyStatus,
    agentControl: { lastError: 'listen EADDRINUSE 127.0.0.1:5000', state: 'failed', trace: { count: 0 } },
    capabilities: assistantReadyStatus.capabilities.map((capability) =>
      capability.name === 'agentControl' || capability.name === 'sendMessage' ? { ...capability, enabled: false } : capability
    ),
    failure: { category: 'agent_control_unavailable' },
    state: 'unavailable'
  } });
  await openAssistantPanel(desktopWindow);

  await expect(desktopWindow.getByText(/Tool detail: listen EADDRINUSE 127\.0\.0\.1:5000|工具详情：listen EADDRINUSE 127\.0\.0\.1:5000/)).toBeVisible();
});

test('Aide panel removes a thread from local history with the explicit history command', async ({
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

  await desktopWindow.getByRole('button', { name: /Remove from local Foliole Aide history|从本地 Foliole Aide 历史移除/ }).click();

  const requests = await desktopApp.evaluate(() => globalThis.__folioleAssistantInvokeRequests);
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({
      args: { providerThreadId: 'thread-1' },
      command: 'assistant_remove_thread_from_history'
    })
  ]));
});

test('Aide panel retries local history loading after a load failure', async ({
  desktopApp,
  desktopWindow
}) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, { historyFailureOnce: true });
  await openAssistantPanel(desktopWindow);

  await expect(desktopWindow.getByText(/could not load local history|未能加载本地历史/)).toBeVisible();
  await desktopWindow.getByRole('button', { name: /^(Retry|重试)$/ }).click();

  await expect(desktopWindow.getByRole('button', { name: /Original prompt/i })).toBeVisible();
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

async function installAssistantIpcMock(
  electronApp: ElectronApplication,
  options: { historyFailureOnce?: boolean; sendFailure?: 'auth_failed'; status?: unknown } = {}
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

async function expectAssistantSendPayload(electronApp: ElectronApplication) {
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
