import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-message-layout.png'
);

test('Aide renders a titled Markdown conversation with live progress', async ({
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

  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Explain this topic');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByRole('status')).toContainText(/Thinking|正在思考/);
  await expect(desktopWindow.getByRole('heading', { name: 'Explain this topic' })).toBeVisible();
  await expect(desktopWindow.getByRole('heading', { name: 'Assistant answer' })).toBeVisible();
  await expect(desktopWindow.getByRole('list')).toContainText('First item');
  await expect(desktopWindow.getByText('const ready = true;')).toBeVisible();
  await expect(desktopWindow.locator('[data-message-role="user"] p')).toHaveClass(/rounded-lg/);
  await expect(desktopWindow.locator('[data-message-role="assistant"]')).not.toHaveClass(/rounded|bg-/);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-message-layout', {
    contentType: 'image/png',
    path: screenshotPath
  });
});

async function openAssistantPanel(page: Page) {
  const directButton = page.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  if (await directButton.count()) {
    await directButton.first().click();
    return;
  }
  await page.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ }).click();
  await page.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

async function installAssistantIpcMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }, fixture) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { command?: string }) => {
      if (request.command === 'assistant_get_status') return fixture.status;
      if (request.command === 'assistant_list_thread_index') return [];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command === 'assistant_send_message') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return fixture.response;
      }
      return null;
    });
  }, { response: createAssistantResponse(), status: ASSISTANT_READY_STATUS });
}

function createAssistantResponse() {
  return {
    message: {
      text: '## Assistant answer\n\nThis is the first paragraph.\n\n- First item\n- Second item\n\n`inline code`\n\n```ts\nconst ready = true;\n```',
      threadId: 'thread-new',
      turnId: 'turn-1'
    },
    provider: 'codex-app-server',
    state: 'ready',
    threadIndex: {
      archivedAt: null,
      createdAt: '2026-07-10T00:00:00.000Z',
      deletedAt: null,
      lastOpenedAt: '2026-07-10T00:00:00.000Z',
      location: { type: 'workspace' },
      preview: 'Explain this topic',
      provider: 'codex-app-server',
      providerThreadId: 'thread-new',
      readError: null,
      readState: 'not_requested',
      status: 'active',
      title: 'Explain this topic',
      updatedAt: '2026-07-10T00:00:00.000Z'
    }
  };
}

const ASSISTANT_READY_STATUS = {
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
