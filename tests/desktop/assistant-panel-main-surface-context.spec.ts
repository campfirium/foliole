import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-main-surface-context.png'
);
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
const existingThread = {
  archivedAt: null,
  createdAt: '2026-07-07T00:00:00.000Z',
  deletedAt: null,
  lastOpenedAt: '2026-07-07T00:00:00.000Z',
  location: { type: 'workspace' },
  preview: 'Existing Aide prompt',
  provider: 'codex-app-server',
  providerThreadId: 'thread-main-surface',
  readError: null,
  readState: 'not_requested',
  status: 'active',
  title: 'Existing Aide thread',
  updatedAt: '2026-07-07T00:00:00.000Z'
};

test('Aide continues a saved thread with the visible main panel as current context', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'outline');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await exitFlowIfOpen(desktopWindow);
  const currentTitle = 'Aide context topic';
  await selectCurrentTopic(desktopWindow, currentTitle);
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);
  await desktopWindow.getByRole('button', { name: /Existing Aide thread/ }).click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('What can you see?');
  const sendButton = desktopWindow.getByRole('button', { name: /^(Send|发送)$/ });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect.poll(() => getAssistantSendRequests(desktopApp).then((requests) => requests.length)).toBe(1);
  expect(await getAssistantSendRequests(desktopApp)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      args: expect.objectContaining({
        openingLocation: { type: 'workspace' },
        providerThreadId: 'thread-main-surface',
        workspaceContext: expect.objectContaining({
          activeTitle: currentTitle.trim(),
          scope: 'node'
        })
      }),
      command: 'assistant_send_message'
    })
  ]));

  await verifyVirtualReference(desktopApp, desktopWindow);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-main-surface-context', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

async function selectCurrentTopic(desktopWindow: Page, title: string) {
  await desktopWindow.evaluate(async (topicTitle) => {
    const debug = window.__folioleWorkspaceDebug;
    if (!debug) throw new Error('Workspace debug API unavailable');
    await debug.seedNodes([{
      id: 'aide-context-topic', kind: 'topic', title: topicTitle, content: 'Current topic body'
    }]);
  }, title);
  await desktopWindow.getByRole('treeitem', { name: title, exact: true }).click();
}

async function verifyVirtualReference(desktopApp: ElectronApplication, desktopWindow: Page) {
  const virtualRow = desktopWindow.getByRole('treeitem', { name: /^(Shelved|搁置)$/ });
  await virtualRow.click();
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('What is this view?');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect.poll(() => getAssistantSendRequests(desktopApp).then((requests) => requests.length)).toBe(2);
  const virtualRequest = (await getAssistantSendRequests(desktopApp))[1];
  expect(virtualRequest).toMatchObject({
    args: {
      workspaceContext: {
        activeKind: 'folder',
        activeNodeId: 'special-virtual-shelved',
        activeTitle: (await virtualRow.innerText()).trim(),
        schemaVersion: 1,
        scope: 'node'
      }
    }
  });
  expect((virtualRequest?.args as { workspaceContext: unknown }).workspaceContext).not.toHaveProperty('folder');
}

async function exitFlowIfOpen(desktopWindow: Page) {
  const exitFlowButton = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlowButton.count()) {
    await exitFlowButton.click();
    await expect(exitFlowButton).toBeHidden();
  }
}

async function getAssistantSendRequests(electronApp: ElectronApplication) {
  const requests = await electronApp.evaluate(() => globalThis.__folioleAssistantInvokeRequests);
  return requests.filter((request) => request.command === 'assistant_send_message');
}

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
  await electronApp.evaluate(({ ipcMain }, payload) => {
    globalThis.__folioleAssistantInvokeRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      globalThis.__folioleAssistantInvokeRequests.push(request);
      if (request.command === 'assistant_get_status') return payload.readyStatus;
      if (request.command === 'desktop_update_check') return { phase: 'not-applicable' };
      if (request.command === 'assistant_list_thread_index') return [payload.existingThread];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command === 'assistant_send_message') {
        return {
          message: { text: 'Answer', threadId: 'thread-main-surface', turnId: 'turn-1' },
          provider: 'codex-app-server',
          state: 'ready'
        };
      }
      return null;
    });
  }, { existingThread, readyStatus });
}

declare global {
  var __folioleAssistantInvokeRequests: Array<{ args?: unknown; command?: string }>;
}
