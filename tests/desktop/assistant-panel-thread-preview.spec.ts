import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-thread-preview.png'
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
    let record = createThread('Original prompt', 'Original preview');
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      if (request?.command === 'assistant_get_status') return status;
      if (request?.command === 'assistant_list_thread_index') return [record];
      if (request?.command === 'assistant_list_thread_messages') return [];
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
        archivedAt: null,
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
  }, assistantReadyStatus);
}
