import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  assistantReadyStatus,
  expectAssistantSendPayload,
  installAssistantIpcMock,
  openAssistantPanel
} from './assistant-panel-home-detail.support';
import { expect, test } from './harness/fixtures';

const screenshotPath = path.join(
  process.cwd(),
  '.tmp',
  'artifacts',
  'assistant-panel-home-detail.png'
);
const selectedThreadNotice = /(this panel shows new messages from this app session|这个面板会显示本次应用会话的新消息)/;
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

test('Aide panel keeps the conversation after the Codex process exits', async ({ desktopApp, desktopWindow }, testInfo) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, { sendFailure: 'launch_failed' });
  await openAssistantPanel(desktopWindow);

  const composer = desktopWindow.getByLabel(/^(Foliole Aide message|Foliole Aide 消息)$/);
  await composer.fill('Retry this turn');
  await desktopWindow.getByRole('button', { name: /^(Send|发送)$/ }).click();

  await expect(composer).toHaveValue('Retry this turn');
  await expect(desktopWindow.getByText(/could not reply|未能回复/)).toBeVisible();
  const failureScreenshot = path.join(process.cwd(), '.tmp', 'artifacts', 'assistant-panel-transient-failure.png');
  await desktopWindow.screenshot({ path: failureScreenshot });
  await testInfo.attach('assistant-panel-transient-failure', { path: failureScreenshot, contentType: 'image/png' });
});

test('Aide panel shows the Foliole tools startup failure detail', async ({ desktopApp, desktopWindow }) => {
  await desktopWindow.evaluate(() => {
    localStorage.setItem('foliole-workspace-right-sidebar-active-panel', 'assistant');
    localStorage.setItem('foliole-aide-enabled', 'true');
  });
  await desktopWindow.reload();
  await installAssistantIpcMock(desktopApp, { status: {
    ...assistantReadyStatus,
    agentControl: { capabilities: [], lastError: 'listen EADDRINUSE 127.0.0.1:5000', state: 'failed' },
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
