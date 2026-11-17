import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { installAssistantContinuationIpcMock } from './assistant-panel-continuation.support';
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
const continuationDestinationScreenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-agent-tool-continuation-destination.png'
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

test('Aide history aligns history rows and reveals removal on hover or keyboard focus', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'en');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await installAssistantIpcMock(desktopApp);
  await desktopWindow.reload();
  await openAssistantPanel(desktopWindow);

  await desktopWindow.getByRole('button', { name: 'Original prompt', exact: true }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Follow-up prompt');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('Follow-up answer')).toBeVisible();
  await desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ }).click();

  const title = desktopWindow.getByRole('button', { name: /Original prompt/i });
  const preview = title.getByText('Follow-up prompt');
  const row = desktopWindow.getByRole('listitem').filter({ has: title });
  const shortRow = desktopWindow.getByRole('listitem').filter({
    has: desktopWindow.getByRole('button', { name: 'Short prompt', exact: true })
  });
  const remove = row.getByRole('button', { name: 'Remove from local Foliole Aide history' });
  expect((await row.boundingBox())?.height).toBe((await shortRow.boundingBox())?.height);
  await expect(preview).toHaveCSS('-webkit-line-clamp', '2');
  await expect(remove).toHaveCSS('opacity', '0');
  await title.hover();
  await expect(remove).toHaveCSS('opacity', '0.6');
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-thread-preview', {
    path: screenshotPath,
    contentType: 'image/png'
  });
  await desktopWindow.getByRole('heading', { name: 'Aide' }).hover();
  await expect(remove).toHaveCSS('opacity', '0');
  await title.focus();
  await title.press('Tab');
  await expect(remove).toBeFocused();
  await expect(remove).toHaveCSS('opacity', '1');
});

test('Aide links an old conversation inline and preserves its history in the new conversation', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-app-language', 'zh-Hans');
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await installAssistantIpcMock(desktopApp, 'thread-old');
  await desktopWindow.reload();
  await openAssistantPanel(desktopWindow);
  await desktopWindow.getByRole('button', { name: /Original prompt/i }).click();

  const continuationLink = desktopWindow.getByRole('link', { name: '新对话' });
  await expect(continuationLink).toBeVisible();
  await expect(continuationLink.locator('..')).toContainText(
    '完成任务需要使用新增的 Agent 工具，已转到新对话继续。'
  );
  await mkdir(path.dirname(continuationScreenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: continuationScreenshotPath });
  await continuationLink.click();

  await expect(desktopWindow.getByText('Earlier answer')).toBeVisible();
  await expect(desktopWindow.getByText(
    '为完成任务，已新建此对话并启用新增的 Agent 工具。'
  )).toBeVisible();
  await expect(desktopWindow.getByText('Continued answer')).toBeVisible();
  expect(await desktopWindow.locator('[data-message-role]').evaluateAll((items) => (
    items.map((item) => item.getAttribute('data-message-role'))
  ))).toEqual(['user', 'assistant', 'user', 'system', 'assistant']);
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Now?');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('Latest answer')).toBeVisible();
  expect(await desktopWindow.locator('[data-message-role]').evaluateAll((items) => (
    items.map((item) => item.getAttribute('data-message-role'))
  ))).toEqual(['user', 'assistant', 'user', 'system', 'assistant', 'user', 'assistant']);
  await desktopWindow.screenshot({ path: continuationDestinationScreenshotPath });
  await testInfo.attach('assistant-agent-tool-continuation', {
    path: continuationScreenshotPath,
    contentType: 'image/png'
  });
  await testInfo.attach('assistant-agent-tool-continuation-destination', {
    path: continuationDestinationScreenshotPath,
    contentType: 'image/png'
  });
});

async function installAssistantIpcMock(
  electronApp: ElectronApplication,
  continuedFromThreadId: string | null = null
) {
  if (continuedFromThreadId) {
    await installAssistantContinuationIpcMock(electronApp, assistantReadyStatus);
    return;
  }
  await electronApp.evaluate(({ ipcMain }, status) => {
    let record = createThread('Original prompt');
    const shortRecord = {
      ...record,
      preview: 'Short prompt',
      providerThreadId: 'thread-short',
      title: 'Short prompt'
    };
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request: { command?: string }) => {
      if (request?.command === 'assistant_get_status') return status;
      if (request?.command === 'assistant_list_thread_index') return [record, shortRecord];
      if (request?.command === 'assistant_list_thread_messages') return [];
      if (request?.command === 'assistant_send_message') {
        record = createThread('Follow-up prompt');
        return {
          message: { text: 'Follow-up answer', threadId: 'thread-1', turnId: 'turn-2' },
          provider: 'codex-app-server',
          state: 'ready',
          threadIndex: record
        };
      }
      return handleInvokeRequest(request, { sender: event.sender });
    });
    function createThread(preview: string) {
      return {
        agentToolVersion: 1,
        archivedAt: null,
        continuedFromThreadId: null,
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
        title: 'Original prompt',
        updatedAt: '2026-07-07T00:00:00.000Z'
      };
    }
  }, assistantReadyStatus);
}
