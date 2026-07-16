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
    localStorage.setItem('foliole-workspace-right-sidebar-width', '340');
    localStorage.setItem('foliole-content-region-scales', JSON.stringify({ 'right-panel:assistant': 130 }));
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Explain this topic');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(desktopWindow.getByRole('status')).toContainText(/Thinking|正在思考/);
  await expect(desktopWindow.getByRole('heading', { name: 'Foliole Aide' })).toBeHidden();
  await expect(desktopWindow.getByRole('button', { name: /^(History|历史)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('button', { name: /^(New|新建)$/ })).toBeVisible();
  await expect(desktopWindow.getByRole('heading', { name: 'Explain this topic' })).toBeVisible();
  await expect(desktopWindow.getByRole('heading', { name: 'Assistant answer' })).toBeVisible();
  await expect(desktopWindow.getByRole('list')).toContainText('First item');
  await expect(desktopWindow.getByRole('table')).toContainText('Follow current material');
  await expect(desktopWindow.getByText('const ready = true;')).toBeVisible();
  await expect(desktopWindow.locator('[data-message-role="user"] p')).toHaveClass(/rounded-lg/);
  await expect(desktopWindow.locator('[data-message-role="assistant"]')).not.toHaveClass(/rounded|bg-/);
  const messageScroll = desktopWindow.getByTestId('assistant-message-scroll');
  const rightInset = await messageScroll.evaluate((element) =>
    window.innerWidth - element.getBoundingClientRect().right
  );
  expect(rightInset).toBeGreaterThanOrEqual(-2);
  expect(rightInset).toBeLessThanOrEqual(2);
  expect(await messageScroll.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);

  await mkdir(path.dirname(screenshotPath), { recursive: true });
  await desktopWindow.locator('[data-panel-scale-id="right-panel:assistant"]').screenshot({ path: screenshotPath });
  await testInfo.attach('assistant-panel-message-layout', {
    contentType: 'image/png',
    path: screenshotPath
  });
});

test('Aide returns to saved history after an unpersisted turn fails', async ({
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

  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Fail this turn');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText(/could not reply|未能回复/)).toBeVisible();
  await desktopWindow.getByRole('button', { name: /^(Back to history|返回历史)$/ }).click();

  await expect(desktopWindow.getByRole('button', { name: /Saved conversation/ })).toBeVisible();
  await expect(desktopWindow.getByText('Fail this turn')).toBeHidden();
});

test('Aide exposes a return-to-latest control after reading earlier content', async ({
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

  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('Long response');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('Paragraph 30')).toBeVisible();

  const viewport = desktopWindow.getByTestId('assistant-message-scroll');
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  const returnButton = desktopWindow.getByRole('button', {
    name: /^(Scroll to latest message|回到最新消息)$/
  });
  await expect(returnButton).toBeVisible();
  await returnButton.click();
  await expect(returnButton).toBeHidden();
});

test('Aide omits current material after the follow switch is turned off', async ({
  desktopApp,
  desktopWindow
}) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
    localStorage.removeItem('foliole-aide-follow-current-material');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp);
  await openAssistantPanel(desktopWindow);

  const followSwitch = desktopWindow.getByRole('switch', { name: /Following:|正在跟随：/ });
  await expect(followSwitch).toHaveAttribute('aria-checked', 'true');
  await followSwitch.click();
  await expect(desktopWindow.getByRole('switch', { name: /Follow current material|跟随当前材料/ }))
    .toHaveAttribute('aria-checked', 'false');
  await desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/).fill('No context');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();
  await expect(desktopWindow.getByText('focus:absent')).toBeVisible();
});

async function openAssistantPanel(page: Page) {
  const directButton = page.getByRole('button', { name: /Foliole Aide.*panel|Foliole Aide面板/ });
  const moreButton = page.getByRole('button', { name: /^(More right sidebar panels|更多右侧栏面板)$/ });
  await expect(directButton.first().or(moreButton)).toBeVisible();
  if (await directButton.count()) {
    await directButton.first().click();
    return;
  }
  await moreButton.click();
  await page.getByRole('menuitem', { name: /Foliole Aide/ }).click();
}

async function installAssistantIpcMock(electronApp: ElectronApplication) {
  const response = createAssistantResponse();
  const longResponse = createAssistantResponse(
    `## Long answer\n\n${Array.from({ length: 30 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n')}`
  );
  await electronApp.evaluate(({ ipcMain }, fixture) => {
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (_event, request: { args?: { message?: string; workspaceContext?: unknown }; command?: string }) => {
      if (request.command === 'assistant_get_status') return fixture.status;
      if (request.command === 'assistant_list_thread_index') return [fixture.savedThread];
      if (request.command === 'assistant_list_thread_messages') return [];
      if (request.command === 'assistant_send_message') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (request.args?.message === 'Fail this turn') {
          return { failure: { category: 'protocol_error' }, provider: 'codex-app-server', state: 'failed' };
        }
        if (request.args?.message === 'Long response') return fixture.longResponse;
        if (request.args?.message === 'No context') {
          const context = request.args.workspaceContext as { activeNodeId?: string } | undefined;
          return {
            ...fixture.response,
            message: {
              ...fixture.response.message,
              text: context?.activeNodeId ? 'focus:present' : 'focus:absent'
            }
          };
        }
        return fixture.response;
      }
      return null;
    });
  }, {
    longResponse,
    response,
    savedThread: {
      ...response.threadIndex,
      preview: 'Saved conversation',
      providerThreadId: 'thread-saved',
      title: 'Saved conversation'
    },
    status: ASSISTANT_READY_STATUS
  });
}

function createAssistantResponse(text = DEFAULT_ASSISTANT_MARKDOWN) {
  return {
    message: {
      text,
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

const DEFAULT_ASSISTANT_MARKDOWN = [
  '## Assistant answer',
  'This is the first paragraph.',
  '- First item\n- Second item',
  '| State | Copy |\n| --- | --- |\n| On | Follow current material |',
  '`inline code`',
  '```ts\nconst ready = true;\n```'
].join('\n\n');

const ASSISTANT_READY_STATUS = {
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
