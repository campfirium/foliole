import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import {
  assistantReadyStatus,
  openAssistantPanel
} from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-partial-failure.png'
);

test('Aide preserves streamed text without restoring the prompt after a later failure', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installPartialFailureIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  const composer = desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/);
  await composer.fill('Continue our discussion');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByText('A useful partial reply')).toBeVisible();
  await expect(desktopWindow.getByText(/could not reply|未能回复/)).toBeVisible();
  await expect(composer).toHaveValue('');
  await composer.fill('Continue after the interruption');
  await expect(desktopWindow.getByRole('button', { name: /^(Send|发送)$/ })).toBeEnabled();

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]')
    .screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-partial-failure', {
    contentType: 'image/png',
    path: screenshotPath
  });
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect.poll(() => readSecondTurnThreadId(desktopApp)).toBe('thread-partial');
});

async function installPartialFailureIpcMock(electronApp: ElectronApplication) {
  await electronApp.evaluate(({ ipcMain }, status) => {
    const runtime = globalThis as typeof globalThis & { __assistantPartialFailureRequests?: unknown[] };
    runtime.__assistantPartialFailureRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request: {
      args?: { clientTurnId?: string };
      command?: string;
    }) => {
      if (request.command === 'assistant_get_status') return status;
      if (request.command === 'assistant_list_thread_index') return [];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command !== 'assistant_send_message') return null;
      runtime.__assistantPartialFailureRequests?.push(request.args ?? {});
      const clientTurnId = request.args?.clientTurnId ?? '';
      event.sender.send('foliole:assistant-turn-event', {
        clientTurnId,
        kind: 'started',
        provider: 'codex-app-server',
        providerThreadId: 'thread-partial'
      });
      event.sender.send('foliole:assistant-turn-event', {
        clientTurnId,
        kind: 'delta',
        provider: 'codex-app-server',
        text: 'A useful partial reply'
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      event.sender.send('foliole:assistant-turn-event', {
        clientTurnId,
        failure: { category: 'timeout' },
        kind: 'failed',
        provider: 'codex-app-server',
        text: 'A useful partial reply'
      });
      return { failure: { category: 'timeout' }, provider: 'codex-app-server', state: 'failed' };
    });
  }, assistantReadyStatus);
}

async function readSecondTurnThreadId(electronApp: ElectronApplication) {
  return electronApp.evaluate(() => {
    const runtime = globalThis as typeof globalThis & {
      __assistantPartialFailureRequests?: Array<{ providerThreadId?: string }>;
    };
    return runtime.__assistantPartialFailureRequests?.[1]?.providerThreadId ?? null;
  });
}
