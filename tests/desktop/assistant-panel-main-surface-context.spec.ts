import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-main-surface-context.png'
);
const readyStatus = {
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

test('Aide sends the visible virtual main panel list as workspace context', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await exitFlowIfOpen(desktopWindow);
  await seedShelvedMainPanel(desktopWindow);

  await desktopWindow.getByRole('treeitem', { name: /^(Shelved|已搁置)$/ }).click();
  await expect(desktopWindow.getByTestId('folder-list-title-aide-visible-shelved')).toBeVisible();
  await openAssistantPanel(desktopWindow);
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('What can you see?');
  const sendButton = desktopWindow.getByRole('button', { name: /^(Send|发送)$/ });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect.poll(() => getAssistantSendRequests(desktopApp).then((requests) => requests.length)).toBe(1);
  expect(await getAssistantSendRequests(desktopApp)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      args: expect.objectContaining({
        workspaceContext: expect.objectContaining({
          activeNodeId: 'special-virtual-shelved',
          folder: expect.objectContaining({
            children: expect.arrayContaining([
              expect.objectContaining({
                nodeId: 'aide-visible-shelved',
                title: 'Visible shelved Aide topic'
              })
            ])
          })
        })
      }),
      command: 'assistant_send_message'
    })
  ]));

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-main-surface-context', {
    path: screenshotPath,
    contentType: 'image/png'
  });
});

async function seedShelvedMainPanel(desktopWindow: Page) {
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await expect.poll(() =>
    desktopWindow.evaluate(() => window.__folioleWorkspaceDebug!.isHydrated())
  ).toBe(true);
  await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.upsertTopicForDebug({
      content: 'This preview must travel through the main panel context.',
      id: 'aide-visible-shelved',
      title: 'Visible shelved Aide topic'
    })
  );
  await expect.poll(() =>
    desktopWindow.evaluate(() =>
      window.__folioleWorkspaceDebug!.getNode('aide-visible-shelved')?.title
    )
  ).toBe('Visible shelved Aide topic');
  await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug!.shelveNode('aide-visible-shelved', '2026-07-09T00:00:00.000Z')
  );
  await expect.poll(() =>
    desktopWindow.evaluate(() =>
      window.__folioleWorkspaceDebug!.getNode('aide-visible-shelved')?.shelvedAt
    )
  ).toBe('2026-07-09T00:00:00.000Z');
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
  await electronApp.evaluate(({ ipcMain }, status) => {
    globalThis.__folioleAssistantInvokeRequests = [];
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: unknown; command?: string }) => {
      globalThis.__folioleAssistantInvokeRequests.push(request);
      if (request.command === 'assistant_get_status') return status;
      if (request.command === 'assistant_list_thread_index') return [];
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
  }, readyStatus);
}

declare global {
  interface Window {
    __folioleWorkspaceDebug?: {
      seedNodes: (
        nodes: Array<{ content: string; id: string; shelvedAt?: string | null; title: string }>,
        options?: { persist?: boolean }
      ) => Promise<void>;
      getNode: (nodeId: string) => { shelvedAt: string | null; title: string } | null;
      isHydrated: () => boolean;
      shelveNode: (nodeId: string, now?: string) => boolean;
      upsertTopicForDebug: (args: { content: string; id: string; title: string }) => boolean;
    };
  }
  var __folioleAssistantInvokeRequests: Array<{ args?: unknown; command?: string }>;
}
