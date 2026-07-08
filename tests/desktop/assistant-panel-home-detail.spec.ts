import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-home-detail.png'
);
const selectedThreadNotice = /(Earlier messages stay in Codex|更早的消息保留在 Codex 中)/;

test('Aide panel keeps home and conversation detail separate', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);

  await desktopWindow.getByRole('button', { name: /^(Connect|连接)$/ }).click();
  await expect(desktopWindow.getByRole('button', { name: /Original prompt/i })).toBeVisible();
  await expect(desktopWindow.getByText(selectedThreadNotice)).toBeHidden();

  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();
  await expect(desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ })).toBeVisible();
  await expect(desktopWindow.getByText(selectedThreadNotice)).toBeVisible();

  await desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('New prompt');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByText('Assistant answer')).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ })).toBeVisible();

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-home-detail', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

async function installAssistantIpcMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }) => {
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
    ipcMain.handle('foliole:invoke', async (_event, request: { command?: string }) => {
      const command = request?.command;
      if (command === 'assistant_get_status') {
        return {
          capabilities: [
            { enabled: true, name: 'status' },
            { enabled: true, name: 'sendMessage' },
            { enabled: true, name: 'threadIndex' }
          ],
          provider: 'codex-app-server',
          state: 'ready'
        };
      }
      if (command === 'assistant_list_thread_index') return [createThread('thread-1', 'Original prompt')];
      if (command === 'assistant_send_message') {
        return {
          message: { text: 'Assistant answer', threadId: 'thread-new', turnId: 'turn-1' },
          provider: 'codex-app-server',
          state: 'ready',
          threadIndex: createThread('thread-new', 'New prompt')
        };
      }
      return null;
    });
  });
}
