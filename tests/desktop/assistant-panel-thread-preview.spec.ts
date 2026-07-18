import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { openAssistantPanel } from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-thread-preview.png'
);
const continuationScreenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-agent-tool-continuation.png'
);

const assistantReadyStatus = {
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

test('Aide history keeps a continued thread title stable and updates the preview', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Follow-up prompt');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('Follow-up answer')).toBeVisible();
  await desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ }).click();

  await expect(desktopWindow.getByRole('button', { name: /Original prompt/i })).toBeVisible();
  await expect(desktopWindow.getByText(/Follow-up prompt/)).toBeVisible();
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-thread-preview', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

test('Aide explains an Agent tool continuation inside the new conversation', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'zh-Hans');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, 'thread-old');
  await openAssistantPanel(desktopWindow);
  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();

  await expect(desktopWindow.getByText('Earlier answer')).toBeVisible();
  await expect(desktopWindow.getByText(
    '为完成任务，已新建此对话并启用新增的 Agent 工具。'
  )).toBeVisible();
  await expect(desktopWindow.getByText('Continued answer')).toBeVisible();
  await mkdir(path.dirname(continuationScreenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: continuationScreenshotPath });
  await testInfo.attach('assistant-agent-tool-continuation', {
    path: continuationScreenshotPath,
    contentType: 'image/png'
  });
});

async function installAssistantIpcMock(
  electronApp: ElectronApplication,
  continuedFromThreadId: string | null = null
) {
  await electronApp.evaluate(({ ipcMain }, payload) => {
    const { continuedFromThreadId, status } = payload;
    let record = createThread('Original prompt', 'Original preview');
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      if (request?.command === 'assistant_get_status') return status;
      if (request?.command === 'assistant_list_thread_index') return [record];
      if (request?.command === 'assistant_list_thread_messages') {
        return continuedFromThreadId ? createContinuedMessages() : [];
      }
      if (request?.command === 'assistant_send_message') {
        record = createThread('Original prompt', 'Follow-up prompt');
        return {
          message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
          provider: 'codex-app-server',
          state: 'ready',
          threadIndex: record
        };
      }
      return null;
    });
    function createThread(title: string, preview: string) {
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
        providerThreadId: 'thread-1',
        readError: null,
        readState: 'not_requested',
        status: 'active',
        title,
        updatedAt: '2026-07-07T00:00:00.000Z'
      };
    }
    function createContinuedMessages() {
      return [
        createMessage('turn-old:user', 'user', 'Earlier question', '2026-07-07T00:00:01.000Z'),
        createMessage('turn-old:assistant', 'assistant', 'Earlier answer', '2026-07-07T00:00:02.000Z'),
        createMessage('turn-new:user', 'user', 'Continue now', '2026-07-07T00:00:03.000Z'),
        createMessage('turn-new:assistant', 'assistant', 'Continued answer', '2026-07-07T00:00:04.000Z')
      ];
    }
    function createMessage(id: string, role: 'assistant' | 'user', text: string, createdAt: string) {
      return { createdAt, id, provider: 'codex-app-server', providerThreadId: 'thread-1', role, text };
    }
  }, { continuedFromThreadId, status: assistantReadyStatus });
}
